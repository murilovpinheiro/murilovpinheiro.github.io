import * as vega from "https://esm.sh/vega";
import * as vegaLite from "https://esm.sh/vega-lite";
import * as vegaLiteApi from "https://esm.sh/vega-lite-api";
import * as tooltip from "https://esm.sh/vega-tooltip";
import * as d3 from "https://esm.sh/d3";

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
            .normalize("NFD")               // separa letras e acentos
            .replace(/[\u0300-\u036f]/g, "") // remove os acentos
            .replace(/ç/g, "c")              // trata ç separadamente (opcional)
            .replace(/[^a-z0-9\s]/g, "")     // remove outros caracteres especiais, se quiser
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

    // customers -> rename customer_city to geolocation_city
    const customers_geo = customers.map(d => {
        const { customer_city, ...rest } = d;
        return { ...rest, geolocation_city: customer_city };
    });

    // JOIN: orders + customers
    const ordersWithCustomer = innerJoin(orders, customers_geo, "customer_id");

    // JOIN: ordersWithCustomer + payments
    const ordersWithPayments = innerJoin(ordersWithCustomer, payments, "order_id");

    // JOIN: ordersWithPayments + orderItems
    const ordersWithItems = innerJoin(ordersWithPayments, orderItems, "order_id");

    // JOIN: ordersWithItems + products
    const fullData = innerJoin(ordersWithItems, products, "product_id");

    return fullData;
}

function filterDataByCategory(category, data) {
    if (!category || category === "all") {
        return data;
    }

    return data.filter(row => row.product_category_name === category);
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
        .map(([day, count]) => ({ date: day, count }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// esse pega pelo destino
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
        if (!totals.has(type)) {
            totals.set(type, 0);
        }
        totals.set(type, totals.get(type) + value);
    }

    return Array.from(totals.entries())
        .map(([payment_type, total_value]) => ({ payment_type, total_value }));
}

//esse pega pelo destino
function computeOrdersByState(orders, custMap) {
    const counts = new Map();

    for (const order of orders) {
        const estado = custMap.get(order.customer_id);
        if (!estado) continue;
        counts.set(estado, (counts.get(estado) || 0) + 1);
    }

    return Array.from(counts.entries())
        .map(([estado, pedidos]) => ({ estado, pedidos }))
        // se quiser ordenar alfabeticamente:
        .sort((a, b) => a.estado.localeCompare(b.estado));
}

function renderLineChart(category, data) {
    const dataByCategory = filterDataByCategory(category, data);
    const ordersByDay = computeOrdersByDay(dataByCategory);

    document.getElementById("line_chart").innerHTML = "";

    const hover = vl.selectPoint('hover')
        .encodings('x')  // limit selection to x-axis value
        .on('mouseover') // select on mouseover events
        .toggle(false)   // disable toggle on shift-hover
        .nearest(true);  // select data point nearest the cursor

    const isHovered = hover.empty(false);

    const line = vl.markLine({ interpolate: "linear", stroke: "#1f77b4" })
        .encode( vl.x().fieldT("date"),
                 vl.y().fieldQ("count").title("Número de pedidos").axis({ grid: true }));

    const base = line.transform(vl.filter(isHovered));

    vl.layer([
        line,
        vl.markRule({color: '#ffffff'})
            .transform(vl.filter(isHovered))
            .encode(vl.x().fieldT('date')),
        line.markCircle({tooltip: true})
            .params(hover) // use as anchor points for selection
            .encode(
                vl.opacity().if(isHovered, vl.value(1)).value(0),
                vl.size().if(isHovered, vl.value(48)).value(100),
                vl.tooltip([
                    { field: "date", type: "temporal", title: "Data" },
                    { field: "count", type: "quantitative", title: "Pedidos" }
                ])
            ),


    ])
        .data(ordersByDay)
        .width(750)
        .height(400)
        .padding({ bottom: 60, left: 40, right: 40, top: 40 })
        .title({ text: "Número de pedidos ao longo do tempo", font: "sans-serif",color:"#e0e1dd"})
        .config({
            background: "#0b051d",
            axis: {
                labelColor: "#e0e1dd",
                titleColor: "#e0e1dd",
                gridColor: "#3a506b"
            }
        })

        .render().then(view => document.getElementById("line_chart").appendChild(view))
        .catch(console.error);
}

function renderBarChart(category, data) {
    const filteredOrders = filterDataByCategory(category, data);
    const ordersByCity = computeOrdersByCity(filteredOrders);

    document.getElementById("bar_chart").innerHTML = "";

    const sortedCities = ordersByCity
        .sort((a, b) => b.orders - a.orders)
        .map(d => d.city);

    const click = vl
        .selectPoint("clickedBar")
        .on("click")
        .clear("dblclick")
        .fields("city");

    const bar = vl.markBar()
        .encode(
        vl.x().fieldQ("orders").title("Número de Pedidos").axis({ grid: true }),
        vl.y().fieldN("city").title(null).sort(sortedCities),
        vl.color().value("#1bbfe9"), // azul claro
        vl.opacity().if(click, vl.value(1.0)).value(0.3),  //change opacity as well
        vl.strokeWidth().if(click, vl.value(2)).value(0),
        vl.tooltip([
            { field: "city", type: "nominal", title: "Cidade" },
            { field: "orders", type: "quantitative", title: "Pedidos", format: ".0f" }
        ])
        ).params(click)
    vl.layer([bar,
        vl.markText({
            dx: -16,           // move mais à esquerda
            fontSize: 10,      // aumenta o tamanho
            fontWeight: "bold",// deixa mais grosso
            fill: "#10072c"    // cor branca (ou troque por outra mais escura se quiser)
            })
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
        .config({
            background: "#0b051d",
            axis: {
                labelColor: "#e0e1dd",
                titleColor: "#e0e1dd",
                gridColor: "#3a506b"
            }
        })
        .render()
        .then(view => document.getElementById("bar_chart").appendChild(view))
        .catch(console.error);
}

function renderPieChart(category, data) {
    const filteredPayments = filterDataByCategory(category, data);
    const paymentsByType = computePaymentsByType(filteredPayments);

    document.getElementById("pie_chart").innerHTML = "";

    const totalSum = paymentsByType.reduce((sum, d) => sum + d.total_value, 0);
    const processedData = paymentsByType.map(d => {
        const percent = (d.total_value / totalSum) * 100;
        return {
            ...d,
            percent,
            percent_str: percent.toFixed(1) + "%"  // nova string com "%"
        };
    });

    const click = vl.selectPoint().on("click").clear("dblclick").fields(["payment_type"]).bind("legend");

    const pie = vl.markArc({ outerRadius: 120, innerRadius: 80 })
        .encode(
            vl.theta().fieldQ("total_value").aggregate("sum"),
            vl.color()
                .fieldN("payment_type")
                .scale({
                    domain: ["credit_card", "boleto", "voucher", "debit_card"],
                    range: ["#1bbfe9", "#7461a5", "#3b5dac", "#7bc895"]})
                .legend({ title: "Tipo de Pagamento", labelColor: "#e0e1dd", titleColor: "#e0e1dd", offset:0}),
            vl.order().fieldQ("total_value").sort("descending"),
            vl.opacity().if(click, vl.value(1.0)).value(0.3),  //change opacity as well
            vl.size().if(click, vl.value(300)).value(50),
            vl.tooltip([
                { field: "payment_type", type: "nominal", title: "Tipo de Pagamento" },
                { field: "total_value", type: "quantitative", title: "Valor Total", format: ".2f" }
            ])
        ).params(click)

    vl.layer([
        pie,
        vl.markText({
            align: "center",
            fontSize: 24,      // aumenta tamanho
            fontWeight: "bold",
            fill: "#a6a6a6"
        })
            .encode(
                vl.text().fieldN("percent_str"), // campo formatado como string com '%'
                vl.theta().fieldQ("total_value"),
                vl.opacity().if(click.empty(false), vl.value(1)).value(0)
            )
            .transform(vl.filter(click))])
        .data(processedData)
        .width(260)
        .height(260)
        .padding(10)
        .title({ text: "Distribuição do valor por Payment Type", font: "sans-serif", color: "#e0e1dd" })
        .config({
            background: "#0b051d",
            axis: {
                labelColor: "#e0e1dd",
                titleColor: "#e0e1dd"
            }
        })
        .render()
        .then(view => document.getElementById("pie_chart").appendChild(view))
        .catch(console.error);
}

async function renderMapChart(category, data) {
    try {
        const geoStates = await d3.json("https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/master/geojson/br_states.json");
        const custMap = new Map(data.map(c => [c.customer_id, c.customer_state]));

        const filteredOrders = filterDataByCategory(category, data);
        const ordersByState = computeOrdersByState(filteredOrders, custMap);

        document.getElementById("map_chart").innerHTML = "";

        vl.markGeoshape({ stroke: "#000000", strokeWidth: 0.5 })
            .data(geoStates.features)
            .transform(
                vl.lookup("id")
                    .from(vl.data(ordersByState).key("estado").fields(["estado", "pedidos"]))
                    .as(["estado", "pedidos"]),
                vl.calculate("datum.pedidos || 0").as("Pedidos")
            )
            .encode(
                vl.color()
                    .fieldQ("Pedidos")
                    .scale({
                        type: "log",
                        domain: [1, d3.max(ordersByState, d => d.pedidos) || 10],
                        scheme: "blues" // funciona bem em fundo escuro
                    })
                    .legend({
                    title: "Log Número de Pedidos", // <- muda aqui
                    titleColor: "#e0e1dd",
                    labelColor: "#e0e1dd"
                }),
                vl.tooltip([
                    { field: "estado", title: "Estado" },
                    { field: "Pedidos", title: "Número de Pedidos", type: "quantitative" }
                ])
            )
            .project(vl.projection("mercator"))
            .width(600)
            .height(600)
            .config({
                background: "#0b051d",
                axis: {
                    labelColor: "#e0e1dd",
                    titleColor: "#e0e1dd",
                    gridColor: "#3a506b"
                }
            })
            .render()
            .then(view => document.getElementById("map_chart").appendChild(view))
            .catch(console.error);
    } catch (err) {
        console.error("Erro ao renderizar o mapa:", err);
    }
}

async function init() {
    const data = await loadData()

    // Agora é seguro usar "products"
    const categories = [...new Set(data.map(d => d.product_category_name))].filter(Boolean);

    let selectedCategory = "all";

    d3.select("#radio-buttons")
        .selectAll("label")
        .data(["all", ...categories])
        .enter()
        .append("label")
        .style("margin-right", "10px")
        .html(d => `
            <input type="radio" name="category" value="${d}" ${d === selectedCategory ? "checked" : ""}>
            ${d}`);

    d3.selectAll("input[name='category']").on("change", function () {
        selectedCategory = this.value;
        renderLineChart(selectedCategory, data);
        renderBarChart(selectedCategory, data);
        renderPieChart(selectedCategory, data);
        renderMapChart(selectedCategory, data);
    });

    // Render inicial com "all"
    console.log(data)
    renderLineChart(selectedCategory, data);
    renderBarChart(selectedCategory, data);
    renderPieChart(selectedCategory, data);
    renderMapChart(selectedCategory, data);
}

init();

// lembrar de diferenciar o mapa é a de origem e o bar é a de chegada, ou vice e versa