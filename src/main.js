import * as vega from "https://esm.sh/vega";
import * as vegaLite from "https://esm.sh/vega-lite";
import * as vegaLiteApi from "https://esm.sh/vega-lite-api";
import * as tooltip from "https://esm.sh/vega-tooltip";
import * as d3 from "https://esm.sh/d3";

import {loadData, parserDate, selectColumns} from './dataReader.js';

import {renderAllCharts} from './renderCharts.js'

async function init() {
    const dataRaw = await loadData()

    const dataRaw2 = await parserDate(dataRaw)

    const data = await selectColumns(dataRaw2, ["customer_id", "geolocation_city",
        "order_id", "product_category_name", "price", "product_id", "customer_state",
        "order_purchase_timestamp", "date", "payment_type", "payment_value"])
    // Agora é seguro usar "products"

    const categories = [...new Set(data.map(d => d.product_category_name))].filter(Boolean);

    let filter = {"product_category_name": "all", "date_range_start": "", "date_range_end": "",
                       "geolocation_city": "", "customer_state": "", "payment_type": ""};

    d3.select("#radio-buttons")
        .selectAll("label")
        .data(["all", ...categories])
        .enter()
        .append("label")
        .style("margin-right", "10px")
        .html(d => `
            <input type="radio" name="category" value="${d}" ${d === filter.product_category_name ? "checked" : ""}>
            ${d}`);
    d3.selectAll("input[name='category']").on("change", function () {
        filter.product_category_name = this.value;
        renderAllCharts(filter, data);
    });

    console.log(data)
    renderAllCharts(filter, data);
}

init();