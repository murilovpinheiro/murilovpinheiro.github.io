import {csv} from "d3";
import {FileAttachment} from "@observablehq/stdlib";
import {utcParse} from "d3-time-format";

// Parse dates!
const parseDate = utcParse("%Y %b %_d");

export default async function () {
    return csv(await FileAttachment("pedidos.csv").url(), d => ({
        ...d,
        order_purchase_timestamp: new Date(d.order_purchase_timestamp),
        order_delivered_customer_date: new Date(d.order_delivered_customer_date),
        order_estimated_delivery_date: new Date(d.order_estimated_delivery_date)
    }));
}

// Write out csv formatted data.
process.stdout.write(csvFormat(launchHistory));






Plot.plot({
    title: "Número de pedidos por cidade",
    width: 800,
    height: 400,
    marginBottom: 60,
    x: {
        type: "band",
        label: "Cidade",
        tickRotate: 45
    },
    y: {
        grid: true,
        label: "Número de pedidos"
    },
    marks: [
        Plot.barY([
            {city: "sao paulo", orders: 24375},
            {city: "ibitinga", orders: 6500},
            {city: "curitiba", orders: 2689},
            {city: "santo andre", orders: 2687},
            {city: "belo horizonte", orders: 2397},
            {city: "rio de janeiro", orders: 2159},
            {city: "guarulhos", orders: 2048},
            {city: "ribeirao preto", orders: 1997},
            {city: "sao jose do rio preto", orders: 1947},
            {city: "maringa", orders: 1836}
        ], {
            x: "city",
            y: "orders",
            fill: "#1f77b4"
        })
    ]
})