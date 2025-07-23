import * as vega from "https://esm.sh/vega";
import * as vegaLite from "https://esm.sh/vega-lite";
import * as vegaLiteApi from "https://esm.sh/vega-lite-api";
import * as tooltip from "https://esm.sh/vega-tooltip";
import * as d3 from "https://esm.sh/d3";

import { computeOrdersByDay, computeOrdersByCity,
         computePaymentsByType, computeOrdersByState,
         computeOrdersByStates, filterDataByCategory} from './computeFunctions.js';


const vl = vegaLiteApi.register(vega, vegaLite, {
    init: (view) => {
        view.tooltip(new tooltip.Handler().call);
        if (view.container()) view.container().style["overflow-x"] = "auto";
    }
});

/*
vl.markRect()
    .data(weather)
    .encode(
        vl.x().fieldO('date').timeUnit('date').title('Day').axis({labelAngle: 0, format: '%e'}),
        vl.y().fieldO('date').timeUnit('month').title('Month'),
        vl.color().fieldQ('temp_max').aggregate('max').legend({title: null})
    )
    .config({view: {strokeWidth: 0, step: 13}, axis: {domain: false}})
    .title("Daily Max Temperatures (C) in Seattle, WA")
    .render()*/

function renderHeatChart(filter, data) {
    let filteredData = filterDataByCategory(filter, data);
    const ordersByStates = computeOrdersByStates(filteredData);
    document.getElementById("heat_chart").innerHTML = "";

    console.log(ordersByStates);

    const click = vl
        .selectPoint("clickedState")
        .on("click")
        .clear("dblclick");

    const date = vl.markRect({strokeWidth: 2})
        .encode(vl.x().fieldO("customer_state").title("Estado do Comprador"),
            vl.y().fieldO("seller_state").title("Estado do Vendedor"),
            vl.fill().fieldQ("orders")
                .scale({
                type: "log",
                domain: [1, d3.max(ordersByStates, d => d.orders) || 10000],
                scheme: "blues" // funciona bem em fundo escuro
            })
                .legend({
                    title: "N° de Pedidos(Escala Log)", // <- muda aqui
                    titleColor: "#e0e1dd",
                    labelColor: "#e0e1dd"
                }),
            vl.stroke().if(click.empty(false), vl.value('black')).value(null),
            vl.opacity().if(click, vl.value(1.0)).value(0.4),
            vl.tooltip([
                { field: "seller_state", type: "nominal", title: "Destino"},
                { field: "customer_state", type: "nominal", title: "Origem" },
                { field: "orders", type: "quantitative", title: "Pedidos", format: ".0f"}
            ])
        ).params(click)

    let layerSpec = vl.layer([date,
        vl.markText({     // move mais à esquerda
            fontSize: 7,      // aumenta o tamanho
            fontWeight: "bold",// deixa mais grosso
            fill: "#10072c"    // cor branca (ou troque por outra mais escura se quiser)
        })
            .encode(
                vl.opacity().if(click.empty(false), vl.value(1)).value(0),
                vl.x().fieldO("customer_state"),
                vl.y().fieldO("seller_state"),
                vl.text().fieldQ("orders"),
            )
            .transform(vl.filter(click))])
        .data(ordersByStates)
        .padding({bottom: 60, left: 40, right: 40, top: 40})
        .title({text: "Número de pedidos ao longo do tempo", font: "sans-serif", color: "#e0e1dd"})
        .config({
            background: "#0b051d",
            axis: {
                labelColor: "#e0e1dd",
                titleColor: "#e0e1dd",
                gridColor: "#3a506b"
            }
        }).toSpec()

    const vegaSpec = vegaLite.compile(layerSpec).spec;

    const view = new vega.View(vega.parse(vegaSpec))
        .renderer("canvas").initialize("#heat_chart").run();

    view.addEventListener("click", (event, item) => {
        // Clona o filtro atual
        const newFilter = { ...filter };

        if (item && item.datum) {
            newFilter.seller_state = item.datum.seller_state; // atualiza apenas geolocation_city
            console.log("Você clicou no dado:", item.datum.seller_state);
            renderAllCharts(newFilter, data, "heat_chart");
        } else {
            // Remove o campo geolocation_city se não houve clique com dado
            newFilter.seller_state = "";
            console.log("Você clicou no gráfico de barras, mas sem dado associado.");
            renderAllCharts(newFilter, data, );
        }
    });

    view.addEventListener("dblclick", () => {
        const newFilter = { ...filter };
        newFilter.seller_state = "";
        console.log("Você clicou no gráfico de mapa, duas vezes.");
        renderAllCharts(newFilter, data, );
    });
}

function renderLineChart(filter, data) {
    let filteredData = filterDataByCategory(filter, data);
    const ordersByDay = computeOrdersByDay(filteredData);
    document.getElementById("line_chart").innerHTML = "";

    const hover = vl.selectPoint('hover')
        .encodings('x')  // limit selection to x-axis value
        .on('mouseover') // select on mouseover events
        .toggle(false)   // disable toggle on shift-hover
        .nearest(true);  // select data point nearest the cursor

    const brush = vl.selectInterval().encodings('x').name("brush");
    const isHovered = hover.empty(false);

    const line = vl.markLine({ interpolate: "linear", stroke: "#1f77b4" })
        .params(brush)
        .encode(vl.x().fieldT("date").title("Data"),
            vl.y().fieldQ("count").title("Número de pedidos").axis({ grid: true }),
            vl.opacity().if(brush, vl.value(1)).value(.8)
        )

    let layerSpec = vl.layer([
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
        }).toSpec()

    const vegaSpec = vegaLite.compile(layerSpec).spec;

    const view = new vega.View(vega.parse(vegaSpec))
        .renderer("canvas").initialize("#line_chart").run();
    view.addEventListener("click", (event, item) => {
        const filter2 = Object.entries(filter);
        // Cria um novo objeto só com esses 3 filtros
        const newFilter = Object.fromEntries(filter2);

        newFilter.date_range_start = "";
        newFilter.date_range_end = "";

        renderAllCharts(newFilter, data);
        console.log("Você clicou no gráfico de linhas, mas sem dado associado.");
        console.log("Intervalo limpo");

    })
    view.addSignalListener("brush", (name, value) => {
        // Cria uma cópia do filtro original
        const newFilter = { ...filter };

        if (value?.date) {
            const start = new Date(value.date[0]).toISOString().slice(0, 10);
            const end = new Date(value.date[1]).toISOString().slice(0, 10);

            console.log("Intervalo selecionado:", start, "até", end);

            // Atualiza apenas os campos de data no filtro
            newFilter.date_range_start = start;
            newFilter.date_range_end = end;

            renderAllCharts(newFilter, data, "line_chart");
        } else {
            // Remove os campos de data mantendo o restante do filtro
            newFilter.date_range_start = "";
            newFilter.date_range_end = "";

            renderAllCharts(newFilter, data,);
        }
    });
}

function renderBarChart(filter, data) {
    const filteredOrders = filterDataByCategory(filter, data);
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

    const maxOrders = d3.max(ordersByCity, d => d.orders);
    const maxAxis = maxOrders * 1.1;

    const bar = vl.markBar()
        .encode(
            vl.x().fieldQ("orders").title("Número de Pedidos").axis({ grid: true }).scale({ domainMax: maxAxis }),
            vl.y().fieldN("city").title(null).sort(sortedCities),
            vl.color().value("#1bbfe9"), // azul claro
            vl.opacity().if(click, vl.value(1.0)).value(0.3),  //change opacity as well
            vl.strokeWidth().if(click, vl.value(2)).value(0),
            vl.tooltip([
                { field: "city", type: "nominal", title: "Cidade" },
                { field: "orders", type: "quantitative", title: "Pedidos", format: ".0f" }
            ])
        ).params(click)
    let layerSpec = vl.layer([bar,
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
        .width(340)
        .padding({ left: 15 })
        .title({ text: "Cidades com Mais Pedidos - Compradores", font: "sans-serif", color: "#e0e1dd" })
        .config({
            background: "#0b051d",
            axis: {
                labelColor: "#e0e1dd",
                titleColor: "#e0e1dd",
                gridColor: "#3a506b"
            }
        }).toSpec()

    const vegaSpec = vegaLite.compile(layerSpec).spec;

    const view = new vega.View(vega.parse(vegaSpec))
        .renderer("canvas").initialize("#bar_chart").run();

    view.addEventListener("click", (event, item) => {
        // Clona o filtro atual
        const newFilter = { ...filter };

        if (item && item.datum) {
            newFilter.geolocation_city = item.datum.city; // atualiza apenas geolocation_city
            console.log("Você clicou no dado:", item.datum.city);
            renderAllCharts(newFilter, data, "bar_chart");
        } else {
            // Remove o campo geolocation_city se não houve clique com dado
            newFilter.geolocation_city = "";
            console.log("Você clicou no gráfico de barras, mas sem dado associado.");
            renderAllCharts(newFilter, data, );
        }
    });


    view.addEventListener("dblclick", () => {
        const newFilter = { ...filter };
        newFilter.geolocation_city = "";
        console.log("Você clicou no gráfico de barra, duas vezes.");
        renderAllCharts(newFilter, data, );
    });


}

function renderPieChart(filter, data) {
    const filteredPayments = filterDataByCategory(filter, data);
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

    let click = vl.selectPoint()
        .on("click")
        .clear("dblclick")
        .fields(["payment_type"])
        .bind("legend")

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
            vl.opacity().if(click, vl.value(1.0)).value(0.3),
            vl.tooltip([
                { field: "payment_type", type: "nominal", title: "Tipo de Pagamento" },
                { field: "total_value", type: "quantitative", title: "Valor Total", format: ".2f" }
            ])
        ).params(click)

    let layerSpec = vl.layer([
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
        .title({ text: "Distribuição do valor por Tipo de Pagamento", font: "sans-serif", color: "#e0e1dd" })
        .config({
            background: "#0b051d",
            axis: {
                labelColor: "#e0e1dd",
                titleColor: "#e0e1dd"
            }
        }).toSpec()

    const vegaSpec = vegaLite.compile(layerSpec).spec;

    const view = new vega.View(vega.parse(vegaSpec))
        .renderer("canvas").initialize("#pie_chart").run();

    view.addEventListener("click", (event, item) => {
        // Clona o filtro atual
        const newFilter = { ...filter };

        if (item && item.datum) {
            newFilter.payment_type = item.datum.payment_type; // atualiza apenas payment_type
            console.log("Você clicou no dado:", item.datum.payment_type);
            renderAllCharts(newFilter, data, "pie_chart");
        } else {
            // Remove o campo payment_type se não houve clique com dado
            newFilter.payment_type = "";
            console.log("Você clicou no gráfico de pizza, mas sem dado associado.");
            renderAllCharts(newFilter, data);
        }
    });

    view.addEventListener("dblclick", () => {
        const newFilter = { ...filter };
        newFilter.payment_type = "";
        console.log("Você clicou no gráfico de pizza, duas vezes.");
        renderAllCharts(newFilter, data, );
    });
    /*
    .render()
    .then(view => {
        document.getElementById("pie_chart").appendChild(view);
    });*/
}

async function renderMapChart(filter, data) {
    try {
        const geoStates = await d3.json("https://raw.githubusercontent.com/giuliano-macedo/geodata-br-states/master/geojson/br_states.json");
        const custMap = new Map(data.map(c => [c.customer_id, c.customer_state]));

        const filteredOrders = filterDataByCategory(filter, data);
        const ordersByState = computeOrdersByState(filteredOrders, custMap);

        document.getElementById("map_chart").innerHTML = "";

        const click = vl.selectPoint()
            .on("click")
            .clear("dblclick")
            .fields(["estado"])
        const map = vl.markGeoshape({ stroke: "#000000", strokeWidth: 0.5 })
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
                        title: "N° de Pedidos(Escala Log)", // <- muda aqui
                        titleColor: "#e0e1dd",
                        labelColor: "#e0e1dd"
                    }),
                vl.opacity().if(click, vl.value(1.0)).value(0.3),
                vl.tooltip([
                    { field: "estado", title: "Estado" },
                    { field: "Pedidos", title: "Número de Pedidos", type: "quantitative" }
                ])
            ).params(click)

        const layerSpec = vl.layer([map])
            .data(geoStates.features)
            .project(vl.projection("mercator"))
            .width(600)
            .height(600)
            .title({ text: "Mapa do Número de Pedidos - Compradores", font: "sans-serif", color: "#e0e1dd" })
            .config({
                background: "#0b051d",
                axis: {
                    labelColor: "#e0e1dd",
                    titleColor: "#e0e1dd",
                    gridColor: "#3a506b"
                }
            }).toSpec()

        const vegaSpec = vegaLite.compile(layerSpec).spec;

        const view = new vega.View(vega.parse(vegaSpec))
            .renderer("canvas").initialize("#map_chart").run();

        view.addEventListener("click", (event, item) => {
            // Clona o filtro atual
            const newFilter = { ...filter };

            if (item && item.datum) {
                newFilter.customer_state = item.datum.estado; // atualiza apenas customer_state
                console.log("Você clicou no dado:", item.datum.estado);
                renderAllCharts(newFilter, data, "map_chart");
            } else {
                // Remove o campo customer_state se não houve clique com dado
                newFilter.customer_state = "";
                console.log("Você clicou no gráfico de mapa, mas sem dado associado.");
                renderAllCharts(newFilter, data, );
            }
        });

        view.addEventListener("dblclick", () => {
            const newFilter = { ...filter };
            newFilter.customer_state = "";
            console.log("Você clicou no gráfico de mapa, duas vezes.");
            renderAllCharts(newFilter, data, );
        });
    } catch (err) {
        console.error("Erro ao renderizar o mapa:", err);
    }
}


function renderAllCharts(filter, data, chartClicked = null){
    console.log("Recarregando...")
    console.log(filter);
    if (chartClicked == null) {
        renderPieChart(filter, data);
        renderLineChart(filter, data);
        renderBarChart(filter, data);
        renderMapChart(filter, data);
        renderHeatChart(filter, data);
    }

    else if(chartClicked == "pie_chart"){
        renderLineChart(filter, data);
        renderBarChart(filter, data);
        renderMapChart(filter, data);
        renderHeatChart(filter, data);
    }

    else if(chartClicked == "line_chart"){
        renderPieChart(filter, data);
        renderBarChart(filter, data);
        renderMapChart(filter, data);
        renderHeatChart(filter, data);
    }
    else if (chartClicked == "bar_chart"){
        renderPieChart(filter, data);
        renderLineChart(filter, data);
        renderMapChart(filter, data);
        renderHeatChart(filter, data);
    }
    else if (chartClicked == "map_chart"){
        renderPieChart(filter, data);
        renderLineChart(filter, data);
        renderBarChart(filter, data);
        renderHeatChart(filter, data);
    }
    else if (chartClicked == "heat_chart"){
        renderPieChart(filter, data);
        renderLineChart(filter, data);
        renderBarChart(filter, data);
        renderMapChart(filter, data);
    }
    else{
        console.log(chartClicked)
        console.log("Eita Deu Problema!")
    }
}

export {renderAllCharts}