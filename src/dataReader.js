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


function parserDate(data) {
    return data.map(row => {
        const date = new Date(row.order_purchase_timestamp);
        date.setHours(0, 0, 0, 0);

        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const formatted = `${yyyy}-${mm}-${dd} 00:00:00`;

        return {
            ...row,
            order_purchase_timestamp: formatted
        };
    });
}

function selectColumns(data, columns) {
    return data.map(item => {
        const filtered = {};
        for (const col of columns) {
            if (col in item) {
                filtered[col] = item[col];
            }
        }
        return filtered;
    });
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

export {loadData, parserDate, selectColumns, vl}