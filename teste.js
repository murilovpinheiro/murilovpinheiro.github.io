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

    // Parse order_purchase_timestamp para Date e payment_value para Number
    return fullData.map(d => ({
        ...d,
        order_purchase_timestamp: new Date(d.order_purchase_timestamp),
        payment_value: +d.payment_value
    }));
}

function renderLineChart(data, filterParamName = "filter") {
    document.getElementById("line_chart").innerHTML = "";

    // Seleção compartilhada pelo nome `filterParamName`
    const click = vl.selectPoint(filterParamName)
        .on("click")
        .clear("dblclick")
        .fields(["payment_type"]); // O campo que a seleção da pie chart irá usar para filtrar

    const line = vl.markLine({ interpolate: "linear", stroke: "#1f77b4" })
        .transform(
            // Extrai a data da coluna de timestamp para criar um campo de data limpo
            vl.calculate("datetime(datum.order_purchase_timestamp.getFullYear(), datum.order_purchase_timestamp.getMonth(), datum.order_purchase_timestamp.getDate())").as("order_purchase_date"),
            // Aplica filtro conforme seleção na pie chart (payment_type)
            vl.filter(click), // Aplica o filtro da seleção diretamente
            // Agrega os dados para contar pedidos por data
            vl.aggregate([{ op: "count", as: "count" }], ["order_purchase_date"])
        )
        .encode(
            vl.x().fieldT("order_purchase_date").title("Data"),
            vl.y().fieldQ("count").title("Número de pedidos").axis({ grid: true }),
            vl.opacity().if(click, vl.value(1)).value(0.3) // Opacidade baseada na seleção
        )
        .params(click)
        .data(data)
        .width(750)
        .height(400)
        .padding({ bottom: 60, left: 40, right: 40, top: 40 })
        .title({ text: "Número de pedidos ao longo do tempo", font: "sans-serif", color: "#e0e1dd" })
        .config({
            background: "#0b051d",
            axis: {
                labelColor: "#e0e1dd",
                titleColor: "#e0e1dd",
                gridColor: "#3a506b"
            }
        });

    line.render()
        .then(view => document.getElementById("line_chart").appendChild(view))
        .catch(console.error);
}

function renderPieChart(data, filterParamName = "filter") {
    document.getElementById("pie_chart").innerHTML = "";

    const click = vl.selectPoint(filterParamName)
        .on("click")
        .clear("dblclick")
        .fields(["order_purchase_date"]) // O campo que a seleção da line chart irá usar para filtrar
        .bind("legend");

    const pie = vl.markArc({ outerRadius: 120, innerRadius: 80 })
        .transform(
            // Extrai a data da coluna de timestamp para criar um campo de data limpo
            vl.calculate("datetime(datum.order_purchase_timestamp.getFullYear(), datum.order_purchase_timestamp.getMonth(), datum.order_purchase_timestamp.getDate())").as("order_purchase_date"),
            // Aplica filtro conforme seleção na line chart (order_purchase_date)
            vl.filter(click), // Aplica o filtro da seleção diretamente
            // Agrega os dados para somar o valor por tipo de pagamento
            vl.aggregate([{ op: "sum", field: "payment_value", as: "total_value" }], ["payment_type"])
        )
        .encode(
            vl.theta().fieldQ("total_value"),
            vl.color()
                .fieldN("payment_type")
                .scale({
                    domain: ["credit_card", "boleto", "voucher", "debit_card"],
                    range: ["#1bbfe9", "#7461a5", "#3b5dac", "#7bc895"]
                })
                .legend({ title: "Tipo de Pagamento", labelColor: "#e0e1dd", titleColor: "#e0e1dd", offset: 0 }),
            vl.order().fieldQ("total_value").sort("descending"),
            vl.opacity().if(click, vl.value(1.0)).value(0.3),
            vl.size().if(click, vl.value(300)).value(50),
            vl.tooltip([
                { field: "payment_type", type: "nominal", title: "Tipo de Pagamento" },
                { field: "total_value", type: "quantitative", title: "Valor Total", format: ".2f" }
            ])
        )
        .params(click);

    vl.layer([
        pie,
        vl.markText({
            align: "center",
            fontSize: 24,
            fontWeight: "bold",
            fill: "#a6a6a6"
        })
            .encode(
                vl.text().fieldQ("total_value").format(".1%"),
                vl.theta().fieldQ("total_value"),
                vl.opacity().if(click.empty(false), vl.value(1)).value(0)
            )
            .transform(vl.filter(click))
    ])
        .data(data)
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

async function main() {
    const data = await loadData();

    // Renderiza os gráficos com o mesmo nome de seleção "filter" para crossfilter automático
    renderLineChart(data, "filter");
    renderPieChart(data, "filter");
}

main();