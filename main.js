window.addEventListener('DOMContentLoaded', function() {
    const vl = vegaLiteApi.register(vega, vegaLite, {
        init: (view) => {
            view.tooltip(new tooltip.Handler().call);
            if (view.container()) view.container().style["overflow-x"] = "auto";
        }
    });

    function normalizeColumn(data, columnName) {
        return data.map(row => ({
            ...row,
            [columnName]: row[columnName]
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/ç/g, "c")
                .replace(/[^a-z0-9\s]/g, "")
        }));
    }

    function innerJoin(left, right, key) {
        const map = new Map(right.map(d => [d[key], d]));
        return left
            .filter(d => map.has(d[key]))
            .map(d => ({ ...d, ...map.get(d[key]) }));
    }

    async function loadData() {
        const [orders, orderItems, products, payments, customers] = await Promise.all([
            d3.csv("./data/olist_orders_dataset.csv"),
            d3.csv("./data/olist_order_items_dataset.csv"),
            d3.csv("./data/olist_products_dataset.csv"),
            d3.csv("./data/olist_order_payments_dataset.csv"),
            d3.csv("./data/olist_customers_dataset.csv")
        ]);

        const customers_geo = customers.map(d => {
            const { customer_city, ...rest } = d;
            return { ...rest, geolocation_city: customer_city };
        });

        const ordersWithCustomer = innerJoin(orders, customers_geo, "customer_id");
        const ordersWithPayments = innerJoin(ordersWithCustomer, payments, "order_id");
        const ordersWithItems = innerJoin(ordersWithPayments, orderItems, "order_id");
        const fullData = innerJoin(ordersWithItems, products, "product_id");

        return fullData.map(d => ({
            ...d,
            order_purchase_timestamp: new Date(d.order_purchase_timestamp),
            payment_value: +d.payment_value
        }));
    }

    function filterData(filterState, data) {
        let filtered = data;
        if (filterState.category && filterState.category !== "all") {
            filtered = filtered.filter(d => d.product_category_name === filterState.category);
        }
        if (filterState.dateRange.start && filterState.dateRange.end) {
            filtered = filtered.filter(d => {
                const date = new Date(d.order_purchase_timestamp);
                return date >= filterState.dateRange.start && date <= filterState.dateRange.end;
            });
        }
        if (filterState.product) {
            filtered = filtered.filter(d => d.product_id === filterState.product);
        }
        return filtered;
    }

    function computeOrdersByDay(orders) {
        const counts = new Map();
        for (const order of orders) {
            const date = new Date(order.order_purchase_timestamp);
            if (!isNaN(date)) {
                const day = date.toISOString().slice(0, 10);
                counts.set(day, (counts.get(day) || 0) + 1);
            }
        }
        return Array.from(counts.entries())
            .map(([day, count]) => ({ date: new Date(day), count }))
            .sort((a, b) => a.date - b.date);
    }

    function computeOrdersByCity(orders) {
        const cityCounts = new Map();
        for (const order of orders) {
            const city = order.geolocation_city;
            if (city) {
                cityCounts.set(city, (cityCounts.get(city) || 0) + 1);
            }
        }
        return Array.from(cityCounts.entries())
            .map(([city, orders]) => ({ city, orders }))
            .sort((a, b) => b.orders - a.orders)
            .slice(0, 10);
    }

    function computePaymentsByType(payments) {
        const totals = new Map();
        for (const payment of payments) {
            const type = payment.payment_type;
            const value = +payment.payment_value;
            totals.set(type, totals.get(type) || 0 + value);
        }
        return Array.from(totals.entries())
            .map(([payment_type, total_value]) => ({ payment_type, total_value }));
    }

    function computeOrdersByState(orders, custMap) {
        const counts = new Map();
        for (const order of orders) {
            const estado = custMap.get(order.customer_id);
            if (estado) {
                counts.set(estado, (counts.get(estado) || 0) + 1);
            }
        }
        return Array.from(counts.entries())
            .map(([estado, pedidos]) => ({ estado, pedidos }))
            .sort((a, b) => a.estado.localeCompare(b.estado));
    }

    function computeDailyOrders(data) {
        const counts = new Map();
        for (const d of data) {
            const date = d.order_purchase_timestamp.toISOString().slice(0, 10);
            counts.set(date, (counts.get(date) || 0) + 1);
        }
        return Array.from(counts.entries()).map(([date, count]) => ({ date: new Date(date), count }));
    }

    function computeNetworkData(data) {
        const productOrders = new Map();
        data.forEach(d => {
            const pid = d.product_id;
            productOrders.set(pid, (productOrders.get(pid) || 0) + 1);
        });
        const topProducts = Array.from(productOrders.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([product_id]) => product_id);

        const orderProducts = new Map();
        data.forEach(d => {
            if (!orderProducts.has(d.order_id)) orderProducts.set(d.order_id, new Set());
            if (topProducts.includes(d.product_id)) orderProducts.get(d.order_id).add(d.product_id);
        });

        const linksMap = new Map();
        for (const products of orderProducts.values()) {
            const prods = Array.from(products);
            for (let i = 0; i < prods.length; i++) {
                for (let j = i + 1; j < prods.length; j++) {
                    const key = `${prods[i]}|${prods[j]}`;
                    linksMap.set(key, (linksMap.get(key) || 0) + 1);
                }
            }
        }

        const nodes = topProducts.map(product_id => ({ product_id }));
        const links = Array.from(linksMap.entries())
            .filter(([, count]) => count >= 5)
            .map(([key, count]) => {
                const [source, target] = key.split("|");
                return { source: topProducts.indexOf(source), target: topProducts.indexOf(target), count };
            });

        return { nodes, links };
    }

    function renderLineChart(filterState, data) {
        const filteredData = filterData(filterState, data);
        const ordersByDay = computeOrdersByDay(filteredData);
        document.getElementById("line_chart").innerHTML = "";

        const hover = vl.selectPoint('hover')
            .encodings('x')
            .on('mouseover')
            .toggle(false)
            .nearest(true);

        const isHovered = hover.empty(false);

        const line = vl.markLine({ interpolate: "linear", stroke: "#1f77b4" })
            .encode(vl.x().fieldT("date"), vl.y().fieldQ("count").title("Número de pedidos").axis({ grid: true }));

        vl.layer([
            line,
            vl.markRule({ color: '#ffffff' }).transform(vl.filter(isHovered)).encode(vl.x().fieldT('date')),
            line.markCircle({ tooltip: true })
                .params(hover)
                .encode(
                    vl.opacity().if(isHovered, vl.value(1)).value(0),
                    vl.size().if(isHovered, vl.value(48)).value(100),
                    vl.tooltip([{ field: "date", type: "temporal", title: "Data" }, { field: "count", type: "quantitative", title: "Pedidos" }])
                ),
        ])
            .data(ordersByDay)
            .width(750)
            .height(400)
            .padding({ bottom: 60, left: 40, right: 40, top: 40 })
            .title({ text: "Número de pedidos ao longo do tempo", font: "sans-serif", color: "#e0e1dd" })
            .config({ background: "#0b051d", axis: { labelColor: "#e0e1dd", titleColor: "#e0e1dd", gridColor: "#3a506b" } })
            .render().then(view => document.getElementById("line_chart").appendChild(view))
            .catch(console.error);
    }

    function renderBarChart(filterState, data) {
        const filteredOrders = filterData(filterState, data);
        const ordersByCity = computeOrdersByCity(filteredOrders);
        document.getElementById("bar_chart").innerHTML = "";

        const sortedCities = ordersByCity.sort((a, b) => b.orders - a.orders).map(d => d.city);
        const click = vl.selectPoint("clickedBar").on("click").clear("dblclick").fields("city");

        const bar = vl.markBar()
            .encode(
                vl.x().fieldQ("orders").title("Número de Pedidos").axis({ grid: true }),
                vl.y().fieldN("city").title(null).sort(sortedCities),
                vl.color().value("#1bbfe9"),
                vl.opacity().if(click, vl.value(1.0)).value(0.3),
                vl.strokeWidth().if(click, vl.value(2)).value(0),
                vl.tooltip([{ field: "city", type: "nominal", title: "Cidade" }, { field: "orders", type: "quantitative", title: "Pedidos", format: ".0f" }])
            ).params(click);

        vl.layer([
            bar,
            vl.markText({ dx: -16, fontSize: 10, fontWeight: "bold", fill: "#10072c" })
                .encode(
                    vl.opacity().if(click.empty(false), vl.value(1)).value(0),
                    vl.x().fieldQ("orders"),
                    vl.y().fieldN("city").sort(sortedCities),
                    vl.text().fieldQ("orders")
                )
                .transform(vl.filter(click))
        ])
            .data(ordersByCity)
            .width(360)
            .height(360)
            .padding({ left: 65 })
            .title({ text: "Top 10 Cidades Brasileiras com Mais Pedidos", font: "sans-serif", color: "#e0e1dd" })
            .config({ background: "#0b051d", axis: { labelColor: "#e0e1dd", titleColor: "#e0e1dd", gridColor: "#3a506b" } })
            .render().then(view => document.getElementById("bar_chart").appendChild(view))
            .catch(console.error);
    }

    function renderPieChart(filterState, data) {
        const filteredPayments = filterData(filterState, data);
        const paymentsByType = computePaymentsByType(filteredPayments);
        document.getElementById("pie_chart").innerHTML = "";

        const totalSum = paymentsByType.reduce((sum, d) => sum + d.total_value, 0);
        const processedData = paymentsByType.map(d => ({
            ...d,
            percent: (d.total_value / totalSum) * 100,
            percent_str: (d.total_value / totalSum * 100).toFixed(1) + "%"
        }));

        const click = vl.selectPoint().on("click").clear("dblclick").fields(["payment_type"]).bind("legend");

        const pie = vl.markArc({ outerRadius: 120, innerRadius: 80 })
            .encode(
                vl.theta().fieldQ("total_value").aggregate("sum"),
                vl.color().fieldN("payment_type").scale({ domain: ["credit_card", "boleto", "voucher", "debit_card"], range: ["#1bbfe9", "#7461a5", "#3b5dac", "#7bc895"] })
                    .legend({ title: "Tipo de Pagamento", labelColor: "#e0e1dd", titleColor: "#e0e1dd", offset: 0 }),
                vl.order().fieldQ("total_value").sort("descending"),
                vl.opacity().if(click, vl.value(1.0)).value(0.3),
                vl.size().if(click, vl.value(300)).value(50),
                vl.tooltip([{ field: "payment_type", type: "nominal", title: "Tipo de Pagamento" }, { field: "total_value", type: "quantitative", title: "Valor Total", format: ".2f" }])
            ).params(click);

        vl.layer([
            pie,
            vl.markText({ align: "center", fontSize: 24, fontWeight: "bold", fill: "#a6a6a6" })
                .encode(
                    vl.text().fieldN("percent_str"),
                    vl.theta().fieldQ("total_value"),
                    vl.opacity().if(click.empty(false), vl.value(1)).value(0)
                )
                .transform(vl.filter(click))
        ])
            .data(processedData)
            .width(260)
            .height(260)
            .padding(10)
            .title({ text: "Distribuição do valor por Payment Type", font: "sans-serif", color: "#e0e1dd" })
            .config({ background: "#0b051d", axis: { labelColor: "#e0e1dd", titleColor: "#e0e1dd" } })
            .render().then(view => document.getElementById("pie_chart").appendChild(view))
            .catch(console.error);
    }

    async function renderMapChart(filterState, data) {
        try {
            const geoStates = await d3.json("https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/master/geojson/br_states.json");
            const custMap = new Map(data.map(c => [c.customer_id, c.customer_state]));
            const filteredOrders = filterData(filterState, data);
            const ordersByState = computeOrdersByState(filteredOrders, custMap);
            document.getElementById("map_chart").innerHTML = "";

            vl.markGeoshape({ stroke: "#000000", strokeWidth: 0.5 })
                .data(geoStates.features)
                .transform(
                    vl.lookup("id").from(vl.data(ordersByState).key("estado").fields(["estado", "pedidos"])).as(["estado", "pedidos"]),
                    vl.calculate("datum.pedidos || 0").as("Pedidos")
                )
                .encode(
                    vl.color().fieldQ("Pedidos").scale({ type: "log", domain: [1, d3.max(ordersByState, d => d.pedidos) || 10], scheme: "blues" })
                        .legend({ title: "Log Número de Pedidos", titleColor: "#e0e1dd", labelColor: "#e0e1dd" }),
                    vl.tooltip([{ field: "estado", title: "Estado" }, { field: "Pedidos", title: "Número de Pedidos", type: "quantitative" }])
                )
                .project(vl.projection("mercator"))
                .width(600)
                .height(600)
                .config({ background: "#0b051d", axis: { labelColor: "#e0e1dd", titleColor: "#e0e1dd", gridColor: "#3a506b" } })
                .render().then(view => document.getElementById("map_chart").appendChild(view))
                .catch(console.error);
        } catch (err) {
            console.error("Erro ao renderizar o mapa:", err);
        }
    }

    function renderCalendar(filterState, data) {
        const filteredData = filterData({ category: filterState.category }, data);
        const dailyOrders = computeDailyOrders(filteredData);
        document.getElementById("calendar").innerHTML = "";

        const brush = vl.selectInterval('brush').encodings(['x']);
        const spec = vl.markRect()
            .data(dailyOrders)
            .encode(
                vl.x().timeUnit('day').field('date').title('Dia da Semana'),
                vl.y().timeUnit('week').field('date').title('Semana'),
                vl.color().fieldQ('count').scale({ scheme: 'viridis' }),
                vl.tooltip([{ field: 'date', type: 'temporal', title: 'Data' }, { field: 'count', type: 'quantitative', title: 'Pedidos' }])
            )
            .params(brush)
            .width(600)
            .height(200)
            .title({ text: "Pedidos por Dia", font: "sans-serif", color: "#e0e1dd" })
            .config({ background: "#0b051d", axis: { labelColor: "#e0e1dd", titleColor: "#e0e1dd" } })
            .render();

        spec.then(view => {
            document.getElementById("calendar").appendChild(view);
            view.addSignalListener('brush_x', (name, value) => {
                if (value && value.length) {
                    const start = view.scale('x').invert(value[0]);
                    const end = view.scale('x').invert(value[1]);
                    filterState.dateRange = { start, end };
                } else {
                    filterState.dateRange = { start: null, end: null };
                }
                updateFilteredCharts(filterState, data);
            });
        }).catch(console.error);
    }

    function renderNetworkGraph(filterState, data) {
        const filteredData = filterData({ category: filterState.category }, data);
        const { nodes, links } = computeNetworkData(filteredData);
        document.getElementById("network_graph").innerHTML = "";

        const selectProduct = vl.selectPoint('selectProduct').on('click').fields(['product_id']);
        const spec = vl.layer(
            vl.markLine().data(links).encode(
                vl.x().fieldQ('source.x'),
                vl.y().fieldQ('source.y'),
                vl.x2().fieldQ('target.x'),
                vl.y2().fieldQ('target.y'),
                vl.opacity().value(0.3)
            ),
            vl.markCircle().data(nodes).encode(
                vl.x().fieldQ('x'),
                vl.y().fieldQ('y'),
                vl.size().value(100),
                vl.color().value('#1bbfe9'),
                vl.tooltip([{ field: 'product_id', type: 'nominal', title: 'Produto' }])
            ).transform(vl.force().links(links).iterations(300))
        )
            .params(selectProduct)
            .width(360)
            .height(200)
            .title({ text: "Rede de Co-compras de Produtos", font: "sans-serif", color: "#e0e1dd" })
            .config({ background: "#0b051d" })
            .render();

        spec.then(view => {
            document.getElementById("network_graph").appendChild(view);
            view.addDataListener('selectProduct_store', (name, value) => {
                if (value && value.length > 0) {
                    filterState.product = value[0].values.product_id;
                } else {
                    filterState.product = null;
                }
                updateFilteredCharts(filterState, data);
            });
        }).catch(console.error);
    }

    function updateFilteredCharts(filterState, data) {
        renderLineChart(filterState, data);
        renderBarChart(filterState, data);
        renderPieChart(filterState, data);
        renderMapChart(filterState, data);
    }

    async function init() {
        const data = await loadData();
        const categories = [...new Set(data.map(d => d.product_category_name))].filter(Boolean);
        let filterState = { category: "all", dateRange: { start: null, end: null }, product: null };

        d3.select("#radio-buttons")
            .selectAll("label")
            .data(["all", ...categories])
            .enter()
            .append("label")
            .style("margin-right", "10px")
            .html(d => `
                <input type="radio" name="category" value="${d}" ${d === "all" ? "checked" : ""}>
                ${d}`);

        d3.selectAll("input[name='category']").on("change", function () {
            filterState.category = this.value;
            filterState.dateRange = { start: null, end: null };
            filterState.product = null;
            renderCalendar(filterState, data);
            renderNetworkGraph(filterState, data);
            updateFilteredCharts(filterState, data);
        });

        renderCalendar(filterState, data);
        renderNetworkGraph(filterState, data);
        updateFilteredCharts(filterState, data);
    }

    init();
});