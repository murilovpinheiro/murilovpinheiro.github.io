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
    const [orders,
        orderItems, products,
        payments, customers] = await Promise.all([
        d3.csv("./data/olist_orders_dataset.csv"),
        d3.csv("./data/olist_order_items_dataset.csv"),
        d3.csv("./data/olist_products_dataset.csv"),
        d3.csv("./data/olist_order_payments_dataset.csv"),
        d3.csv("./data/olist_customers_dataset.csv")
    ]);

    const customers_geo = customers.map(d => {
        const {customer_city, ...rest} = d;
        return {geolocation_city: customer_city, ...rest};
    });

    const ordersWithCity = innerJoin(orders, customers, "customer_id");
    console.log("Rapaz deu bom!")
    return { orders: ordersWithCity, orderItems, products, payments, customers_geo};
}
function filterOrders(orders, orderItems, products, category) {
    if (!category || category === "all") {
        return orders;
    }

    // Índice: order_id → lista de orderItems
    const orderItemsByOrderId = new Map();
    for (const item of orderItems) {
        if (!orderItemsByOrderId.has(item.order_id)) {
            orderItemsByOrderId.set(item.order_id, []);
        }
        orderItemsByOrderId.get(item.order_id).push(item);
    }

    // Índice: product_id → produto
    const productById = new Map();
    for (const p of products) {
        productById.set(p.product_id, p);
    }

    // Agora o filtro é rápido
    return orders.filter(order => {
        const items = orderItemsByOrderId.get(order.order_id) || [];
        return items.some(item => {
            const product = productById.get(item.product_id);
            return product?.product_category_name === category;
        });
    });
}

function filterPaymentsByCategory(orders, orderItems, products, payments, category) {
    // Índice: order_id → lista de orderItems
    console.log("produtos")
    console.log(products);
    if (!category || category === "all") {
        return payments;
    }
    const orderItemsByOrderId = new Map();
    for (const item of orderItems) {
        if (!orderItemsByOrderId.has(item.order_id)) {
            orderItemsByOrderId.set(item.order_id, []);
        }
        orderItemsByOrderId.get(item.order_id).push(item);
    }
    console.log(orderItemsByOrderId);

    // Índice: product_id → produto
    const productById = new Map();
    for (const p of products) {
        productById.set(p.product_id, p);
    }

    // Filtra order_ids que tenham produto da categoria desejada
    const orderIdsWithCategory = new Set();
    for (const order of orders) {
        const items = orderItemsByOrderId.get(order.order_id) || [];
        if (items.some(item => {
            const product = productById.get(item.product_id);
            return product?.product_category_name === category;
        })) {
            orderIdsWithCategory.add(order.order_id);
        }
    }
    console.log(orderItems[0].product_id, products[0].product_id);

    // Retorna pagamentos cujo order_id está no conjunto filtrado
    return payments.filter(payment => orderIdsWithCategory.has(payment.order_id));
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
        const city = order.customer_city;
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

/*
const orders         = await d3.csv("./data/olist_orders_dataset.csv")
const order_items    = await d3.csv("./data/olist_order_items_dataset.csv")
const sellers        = await d3.csv("./data/olist_sellers_dataset.csv")
const payments       = await d3.csv("./data/olist_order_payments_dataset.csv")
//const geolocationRaw = await d3.csv("./data/olist_geolocation_dataset.csv")
//const customersRaw   = await d3.csv("./data/olist_customers_dataset.csv")
const products =       await d3.csv("./data/olist_products_dataset.csv");

const customers = customersRaw.map(d => {
    const {customer_city, ...rest} = d;
    return {geolocation_city: customer_city, ...rest};
});

//const geolocation = normalizeColumn(geolocationRaw, "geolocation_city");
//const customersN = normalizeColumn(customers, "geolocation_city");

const join1 = innerJoin(orders, order_items, "order_id")
const join2 = innerJoin(join1, payments, "order_id")
const data = innerJoin(join2, sellers, "seller_id")
*/

async function initRadioButtons() {

    // Get unique categories
    const categories = [...new Set(products.map(d => d.product_category_name))].filter(Boolean);
    let selectedCategory = categories[0] || null;

    // Create radio buttons
    d3.select("#radio-buttons")
        .selectAll("label")
        .data(categories)
        .enter()
        .append("label")
        .style("margin-right", "10px")
        .html(d => `
            <input type="radio" name="category" value="${d}" ${d === selectedCategory ? "checked" : ""}>
            ${d}
        `);

    // Return selected category for potential use
    return selectedCategory;
}

//const custMap = new Map(customers.map(c => [c.customer_id, c.customer_state]));

const estadosGeo = await d3.json(
    "https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/master/geojson/br_states.json"
);

function renderLineChart(category, orders, orderItems, products) {
    const filteredOrders = filterOrders(orders, orderItems, products, category);
    console.log("filteredOrders");
    const ordersByDay = computeOrdersByDay(filteredOrders);
    console.log("ordersByDay");

    document.getElementById("line_chart").innerHTML = "";

    vl.layer([
        vl.markLine({ interpolate: "linear", stroke: "#1f77b4" })
            .encode(
                vl.x().fieldT("date"),
                vl.y().fieldQ("count").title("Número de pedidos").axis({ grid: true })
            ),
        vl.markPoint({ opacity: 0, size: 100 })  // aumenta a área de detecção
            .encode(
                vl.x().fieldT("date"),
                vl.y().fieldQ("count"),
                vl.tooltip([
                    { field: "date", type: "temporal", title: "Data" },
                    { field: "count", type: "quantitative", title: "Pedidos" }
                ])
            )
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

function renderBarChart(category, orders, orderItems, products) {
    const filteredOrders = filterOrders(orders, orderItems, products, category);
    const ordersByCity = computeOrdersByCity(filteredOrders);

    document.getElementById("bar_chart").innerHTML = "";

    vl.markBar()
        .data(ordersByCity)
        .encode(
            vl.x().fieldQ("orders").title("Número de Pedidos").axis({ grid: true }),
            vl.y().fieldN("city").title(null).sort({ field: "orders", order: "descending" }).axis({ labelAngle: 0 }),
            vl.color().value("#8ecae6"), // azul claro
            vl.tooltip([
                { field: "city", type: "nominal", title: "Cidade" },
                { field: "orders", type: "quantitative", title: "Pedidos", format: ".0f" }
            ])
        )
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

function renderPieChart(category, orders, orderItems, products, payments) {
    const filteredPayments = filterPaymentsByCategory(orders, orderItems, products, payments, category);
    const paymentsByType = computePaymentsByType(filteredPayments);

    document.getElementById("pie_chart").innerHTML = "";

    vl.markArc({ outerRadius: 120 })
        .data(paymentsByType)
        .encode(
            vl.theta().fieldQ("total_value").aggregate("sum"),
            vl.color()
                .fieldN("payment_type")
                .scale({
                    domain: ["credit_card", "boleto", "voucher", "debit_card"],
                    range: ["#1bbfe9", "#7461a5", "#3b5dac", "#7bc895"]})
                .legend({ title: "Tipo de Pagamento", labelColor: "#e0e1dd", titleColor: "#e0e1dd", offset:0}),
            vl.order().fieldQ("total_value").sort("descending"),
            vl.tooltip([
                { field: "payment_type", type: "nominal", title: "Tipo de Pagamento" },
                { field: "total_value", type: "quantitative", title: "Valor Total", format: ".2f" }
            ])
        )
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

async function renderMapChart(category, orders, orderItems, products, customers_geo) {
    try {
        const geoStates = await d3.json("https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/master/geojson/br_states.json");
        const custMap = new Map(customers_geo.map(c => [c.customer_id, c.customer_state]));
        const filteredOrders = filterOrders(orders, orderItems, products, category, category);
        const pedidosPorEstado = computeOrdersByState(filteredOrders, custMap);

        document.getElementById("map_chart").innerHTML = "";

        vl.markGeoshape({ stroke: "#000000", strokeWidth: 0.5 })
            .data(geoStates.features)
            .transform(
                vl.lookup("id")
                    .from(vl.data(pedidosPorEstado).key("estado").fields(["estado", "pedidos"]))
                    .as(["estado", "pedidos"]),
                vl.calculate("datum.pedidos || 0").as("Pedidos")
            )
            .encode(
                vl.color()
                    .fieldQ("Pedidos")
                    .scale({
                        type: "log",
                        domain: [1, d3.max(pedidosPorEstado, d => d.pedidos) || 10],
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
    const { orders, orderItems, products, payments, customers_geo } = await loadData();

    // Agora é seguro usar "products"
    const categories = [...new Set(products.map(d => d.product_category_name))].filter(Boolean);

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
        renderLineChart(selectedCategory, orders, orderItems, products);
        renderBarChart(selectedCategory, orders, orderItems, products);
        renderPieChart(selectedCategory, orders, orderItems, products, payments);
        renderMapChart(selectedCategory, orders, orderItems, products, customers_geo);
    });

    // Render inicial com "all"
    renderLineChart(selectedCategory, orders, orderItems, products);
    renderBarChart(selectedCategory, orders, orderItems, products);
    renderPieChart(selectedCategory, orders, orderItems, products, payments);
    renderMapChart(selectedCategory, orders, orderItems, products, customers_geo);
}

init();

// lembrar de diferenciar o mapa é a de origem e o bar é a de chegada, ou vice e versa