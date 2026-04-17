// WebPlatform/js/app.js

document.addEventListener('DOMContentLoaded', () => {
    console.log("Initializing Cloud Cost UI...");

    // Check if data is loaded
    if (typeof cloudData === 'undefined') {
        alert("ERROR: Offline Data failed to load. Did you run the Python bundler script?");
        return;
    }

    document.getElementById('recordCount').innerText = `${cloudData.length.toLocaleString()} Records Active`;

    // Extract unique values for filters
    const providers = [...new Set(cloudData.map(d => d.cloud_provider))].filter(Boolean).sort();
    const services = [...new Set(cloudData.map(d => d.service))].filter(Boolean).sort();
    const warehouses = [...new Set(cloudData.map(d => d.warehouse))].filter(Boolean).sort();

    const providerSelect = document.getElementById('providerFilter');
    providers.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.innerText = p;
        providerSelect.appendChild(opt);
    });

    const serviceSelect = document.getElementById('serviceFilter');
    const serviceCodes = {
        'compute': 'EC2/VM',
        'storage': 'S3/Blob',
        'database': 'RDS/DB',
        'networking': 'VPC/Net',
        'machine learning': 'ML',
        'analytics': 'EMR',
        'serverless': 'Lambda',
        'containers': 'EKS/K8s'
    };

    services.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        let displayName = s.charAt(0).toUpperCase() + s.slice(1);
        let shortCode = serviceCodes[s.toLowerCase()];
        opt.innerText = shortCode ? `${displayName} (${shortCode})` : displayName;
        serviceSelect.appendChild(opt);
    });

    const warehouseSelect = document.getElementById('warehouseFilter');
    if (warehouses && warehouses.length > 0) {
        warehouses.forEach(w => {
            const opt = document.createElement('option');
            opt.value = w;
            opt.innerText = w;
            warehouseSelect.appendChild(opt);
        });
    }

    // Chart instances
    let trendChart, providerChart, serviceChart, warehouseChart;

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'Inter';

    // Core Update Function
    function updateDashboard() {
        const timeF = document.getElementById('timeFilter').value;
        const provF = document.getElementById('providerFilter').value;
        const servF = document.getElementById('serviceFilter').value;
        const warehouseF = document.getElementById('warehouseFilter').value;

        // Determine Max Date for relative rolling timeframe logic
        let maxDateStr = cloudData.reduce((max, obj) => obj.date > max ? obj.date : max, "2000-01-01");
        let maxDate = new Date(maxDateStr);

        let filteredData = cloudData.filter(d => {
            // Apply Provider Filter
            if (provF !== 'all' && d.cloud_provider !== provF) return false;
            // Apply Service Filter
            if (servF !== 'all' && d.service !== servF) return false;
            // Apply Warehouse Filter
            if (warehouseF !== 'all' && d.warehouse !== warehouseF) return false;
            
            // Apply Time Filter
            if (timeF !== 'all') {
                let dDate = new Date(d.date);
                let diffTime = Math.abs(maxDate - dDate);
                let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                if (diffDays > parseInt(timeF)) return false;
            }
            return true;
        });

        calculateMetrics(filteredData);
        updateCharts(filteredData);
    }

    function calculateMetrics(data) {
        if (data.length === 0) {
            document.getElementById('metricTotalCost').innerText = "$0.00";
            document.getElementById('metricAvgCost').innerText = "$0.00";
            document.getElementById('metricTopService').innerText = "-";
            return;
        }

        let totalCost = 0;
        let unitCosts = [];
        let serviceTotals = {};

        data.forEach(d => {
            totalCost += Number(d.total_cost || 0);
            if (d.cost_per_unit > 0) unitCosts.push(Number(d.cost_per_unit));

            serviceTotals[d.service] = (serviceTotals[d.service] || 0) + Number(d.total_cost || 0);
        });

        let avgCost = unitCosts.length ? (unitCosts.reduce((a,b)=>a+b, 0) / unitCosts.length) : 0;
        let avgCostPer1k = avgCost * 1000;
        
        let topService = "-";
        let maxSvcCost = -1;
        for (const [svc, cost] of Object.entries(serviceTotals)) {
            if (cost > maxSvcCost) {
                maxSvcCost = cost;
                topService = svc;
            }
        }

        document.getElementById('metricTotalCost').innerText = "$" + totalCost.toLocaleString(undefined, {maximumFractionDigits: 0});
        document.getElementById('metricAvgCost').innerText = "$" + avgCostPer1k.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
        document.getElementById('metricTopService').innerText = topService.charAt(0).toUpperCase() + topService.slice(1);
    }

    function updateCharts(data) {
        // Group by Date for Trend
        let dateTotals = {};
        let provTotals = {};
        let svcTotals = {};
        let warehouseTotals = {};

        data.forEach(d => {
            if(d.date) dateTotals[d.date] = (dateTotals[d.date] || 0) + Number(d.total_cost);
            if(d.cloud_provider) provTotals[d.cloud_provider] = (provTotals[d.cloud_provider] || 0) + Number(d.total_cost);
            if(d.service) svcTotals[d.service] = (svcTotals[d.service] || 0) + Number(d.total_cost);
            if(d.warehouse) warehouseTotals[d.warehouse] = (warehouseTotals[d.warehouse] || 0) + Number(d.total_cost);
        });

        // Sort Trend
        let sortedDates = Object.keys(dateTotals).sort();
        let trendValues = sortedDates.map(k => dateTotals[k]);

        if (trendChart) trendChart.destroy();
        const ctxTrend = document.getElementById('trendChart').getContext('2d');
        trendChart = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [{
                    label: 'Total Cost ($)',
                    data: trendValues,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // Provider Pie
        if (providerChart) providerChart.destroy();
        const ctxProvider = document.getElementById('providerPieChart').getContext('2d');
        providerChart = new Chart(ctxProvider, {
            type: 'doughnut',
            data: {
                labels: Object.keys(provTotals),
                datasets: [{
                    data: Object.values(provTotals),
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
        });

        // Service Bar
        // Sort services descending
        let sortedSvcKeys = Object.keys(svcTotals).sort((a,b) => svcTotals[b] - svcTotals[a]).slice(0, 10);
        
        if (serviceChart) serviceChart.destroy();
        const ctxService = document.getElementById('serviceBarChart').getContext('2d');
        serviceChart = new Chart(ctxService, {
            type: 'bar',
            data: {
                labels: sortedSvcKeys.map(s => s.charAt(0).toUpperCase() + s.slice(1)),
                datasets: [{
                    label: 'Cost by Service',
                    data: sortedSvcKeys.map(k => svcTotals[k]),
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // Warehouse Bar
        let sortedWhKeys = Object.keys(warehouseTotals).sort((a,b) => warehouseTotals[b] - warehouseTotals[a]).slice(0, 5);

        if (warehouseChart) warehouseChart.destroy();
        const ctxWh = document.getElementById('warehouseBarChart').getContext('2d');
        warehouseChart = new Chart(ctxWh, {
            type: 'bar',
            data: {
                labels: sortedWhKeys,
                datasets: [{
                    label: 'Total Cost ($)',
                    data: sortedWhKeys.map(k => warehouseTotals[k]),
                    backgroundColor: '#8b5cf6',
                    borderRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Event Listeners
    document.getElementById('timeFilter').addEventListener('change', updateDashboard);
    document.getElementById('providerFilter').addEventListener('change', updateDashboard);
    document.getElementById('serviceFilter').addEventListener('change', updateDashboard);
    document.getElementById('warehouseFilter').addEventListener('change', updateDashboard);
    
    document.getElementById('resetFilters').addEventListener('click', () => {
        document.getElementById('timeFilter').value = 'all';
        document.getElementById('providerFilter').value = 'all';
        document.getElementById('serviceFilter').value = 'all';
        document.getElementById('warehouseFilter').value = 'all';
        updateDashboard();
    });

    // Initial Render
    updateDashboard();
});
