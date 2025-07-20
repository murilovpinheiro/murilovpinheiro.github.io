import * as vega from "https://esm.sh/vega";
import * as vegaLite from "https://esm.sh/vega-lite";
import * as vegaLiteApi from "https://esm.sh/vega-lite-api";
import * as tooltip from "https://esm.sh/vega-tooltip";
import * as d3 from "https://esm.sh/d3";
// Importe vega-embed também do esm.sh
import vegaEmbed from "https://esm.sh/vega-embed";

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

const pieSpec = {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: 260,
    height: 260,
    padding: 10,
    background: "#0b051d",
    title: {
        text: "Distribuição do valor por Payment Type",
        font: "sans-serif",
        color: "#e0e1dd"
    },
    data: { name: "processedData" },
    params: [
        {
            name: "click_pie_chart",
            select: {
                type: "point",
                fields: ["payment_type"],
                on: "click",
                clear: "dblclick",
                bind: "legend"
            }
        }
    ],
    layer: [
        {
            mark: { type: "arc", outerRadius: 120, innerRadius: 80 },
            encoding: {
                theta: { field: "total_value", type: "quantitative", aggregate: "sum" },
                color: {
                    field: "payment_type",
                    type: "nominal",
                    scale: {
                        domain: ["credit_card", "boleto", "voucher", "debit_card"],
                        range: ["#1bbfe9", "#7461a5", "#3b5dac", "#7bc895"]
                    },
                    legend: {
                        title: "Tipo de Pagamento",
                        labelColor: "#e0e1dd",
                        titleColor: "#e0e1dd",
                        offset: 0
                    }
                },
                order: { field: "total_value", sort: "descending" },
                opacity: {
                    condition: { param: "click_pie_chart", value: 1 },
                    value: 0.3
                },
                size: {
                    condition: { param: "click_pie_chart", value: 300 },
                    value: 50
                },
                tooltip: [
                    { field: "payment_type", type: "nominal", title: "Tipo de Pagamento" },
                    { field: "total_value", type: "quantitative", title: "Valor Total", format: ".2f" }
                ]
            }
        },
        {
            mark: {
                type: "text",
                align: "center",
                fontSize: 24,
                fontWeight: "bold",
                fill: "#a6a6a6"
            },
            encoding: {
                text: { field: "percent_str", type: "nominal" },
                theta: { field: "total_value", type: "quantitative" },
                opacity: {
                    condition: { param: "click_pie_chart", empty: false, value: 1 },
                    value: 0
                }
            },
            transform: [{ filter: { param: "click_pie_chart" } }]
        }
    ]
};

function renderPieChart(processedData) {
    document.getElementById("pie_chart").innerHTML = "";

    // Cria uma cópia profunda do spec para evitar conflitos de sinal
    const specClone = JSON.parse(JSON.stringify(pieSpec));

    vegaEmbed("#pie_chart", specClone, { mode: "vega-lite", actions: false })
        .then(result => {
            result.view.insert("processedData", processedData).run();

            // Adiciona escutador de seleção
            result.view.addSignalListener("click", (name, value) => {
                console.log("Selecionado no pie:", value);
                // atualize seu gráfico aqui
            });
        })
        .catch(console.error);
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

const data = await loadData()

console.log(data)

const processedData = computePaymentsByType(data);

renderPieChart(processedData)