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


const orders         = await d3.csv("./data/olist_orders_dataset.csv")
const order_items    = await d3.csv("./data/olist_order_items_dataset.csv")
const sellers        = await d3.csv("./data/olist_sellers_dataset.csv")
const payments       = await d3.csv("./data/olist_order_payments_dataset.csv")
const geolocationRaw = await d3.csv("./data/olist_geolocation_dataset.csv")
const customersRaw   = await d3.csv("./data/olist_customers_dataset.csv")


const customers = customersRaw.map(d => {
    const {customer_city, ...rest} = d;
    return {geolocation_city: customer_city, ...rest};
});

const geolocation = normalizeColumn(geolocationRaw, "geolocation_city");
const customersN = normalizeColumn(customers, "geolocation_city");

const join1 = innerJoin(orders, order_items, "order_id")
const join2 = innerJoin(join1, payments, "order_id")
const data = innerJoin(join2, sellers, "seller_id")

const join3 = innerJoin(orders, customersN, "customer_id")
const data2 = innerJoin(join3, geolocation, "geolocation_city")

const ordersByCity = Array.from(
    d3.rollup(
        data,
        v => v.length,
        d => d.seller_city // Assumindo que a cidade do vendedor reflete a cidade dos pedidos
    ),
    ([city, orders]) => ({ city, orders })
).sort((a, b) => b.orders - a.orders)
    .slice(0, 10); // Pega as 10 principais cidades

const ordersByDay = (() => {
    const counts = new Map();
    for (const order of data) {
        const date = new Date(order.order_purchase_timestamp);
        if (!isNaN(date)) {
            const day = date.toISOString().slice(0, 10);
            counts.set(day, (counts.get(day) || 0) + 1);
        }
    }
    return Array.from(counts.entries())
        .map(([day, count]) => ({ date: new Date(day), count }))
        .sort((a, b) => a.date - b.date);
})();

const paymentsByType = Array.from(
    d3.rollup(
        payments,
        v => d3.sum(v, d => +d.payment_value), // soma valores pagos
        d => d.payment_type
    ),
    ([payment_type, total_value]) => ({ payment_type, total_value })
)

const abbreviations = {
    "sao paulo": "São Paulo",
    "ibitinga": "Ibitinga",
    "curitiba": "Curitiba",
    "santo andre": "Santo\nAndré",
    "belo horizonte": "Belo\nHorizonte",
    "rio de janeiro": "Rio de\nJaneiro",
    "guarulhos": "Guarulhos",
    "ribeirao preto": "Ribeirão\nPreto",
    "sao jose do rio preto": "São José\ndo Rio Preto",
    "maringa": "Maringá"
};

const custMap = new Map(customers.map(c => [c.customer_id, c.customer_state]));

// Conte pedidos por estado
const pedidosPorEstado = Array.from(
    orders.reduce((map, o) => {
        const st = custMap.get(o.customer_id);
        if (!st) return map;
        map.set(st, (map.get(st) || 0) + 1);
        return map;
    }, new Map()),
    ([estado, count]) => ({ estado, pedidos: count })
);// Carregue o GeoJSON dos estados
const estadosGeo = await d3.json(
    "https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/master/geojson/br_states.json"
);

vl
    .markGeoshape({ stroke: "#888", strokeWidth: 0.5 })
    .data(estadosGeo.features) // ou só estadosGeo se é um array de features
    .transform(
        vl.lookup("id") // usar 'id' que é a sigla do estado
            .from(vl.data(pedidosPorEstado).key("estado").fields(["estado", "pedidos"]))
            .as(["estado", "pedidos"]),
        vl.calculate("datum.pedidos || 0").as("Pedidos")
    )
    .encode(
        vl.color()
            .fieldQ("Pedidos")
            .scale({
                type: "log",   // Aqui está a escala logarítmica
                domain: [1, d3.max(pedidosPorEstado, d => d.pedidos)], // domain deve começar em >0, evite zero
                scheme: "blues"
            }),
        vl.tooltip([
            { field: "estado", title: "Estado" },
            { field: "Pedidos", title: "Número de Pedidos", type: "quantitative" }
        ])
    )
    .project(vl.projection("mercator"))
    .width(850)
    .height(600)
    .render()
    .then(view => document.getElementById("view").appendChild(view))
    .catch(console.error);