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

// esse pega pelos dois
function computeOrdersByStates(orders) {
    const pairCounts = new Map();

    for (const order of orders) {
        const origin = order.seller_state;
        const destination = order.customer_state;

        if (origin && destination) {
            const key = `${origin}|${destination}`; // separador seguro para chave
            pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
    }

    return Array.from(pairCounts.entries())
        .map(([key, count]) => {
            const [seller_state, customer_state] = key.split('|');
            return { seller_state, customer_state, orders: count };
        })
        .sort((a, b) => b.orders - a.orders);
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

function filterDataByCategory(filters, data) {
    if (!filters || Object.keys(filters).length === 0) {
        return data;
    }
    return data.filter(row => {
        for (const [key, value] of Object.entries(filters)) {
            if (value === "" || value === null || value === undefined) {
                continue; // Ignora qualquer filtro com valor vazio
            }

            if (key === "product_category_name" && value === "all") {
                continue; // "all" significa todos, então não filtra
            }

            if (key === "date_range_start" || key === "date_range_end") {
                const rowDate = row.order_purchase_timestamp?.slice(0, 10) + " 00:00:00";
                if (!rowDate) return false;

                const startDate = filters.date_range_start && filters.date_range_start !== "" ? filters.date_range_start + " 00:00:00" : null;
                const endDate = filters.date_range_end && filters.date_range_end !== "" ? filters.date_range_end + " 00:00:00" : null;

                if (startDate && rowDate < startDate) return false;
                if (endDate && rowDate > endDate) return false;

                continue;
            }

            if (row[key] !== value) {
                return false; // valor não bate, filtra
            }
        }
        return true; // passou em todos os filtros
    });
}

export {computePaymentsByType, computeOrdersByState, computeOrdersByCity,
        computeOrdersByDay, computeOrdersByStates, filterDataByCategory}