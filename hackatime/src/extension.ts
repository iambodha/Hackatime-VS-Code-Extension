import * as vscode from 'vscode';
import axios from 'axios';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// WebView Panel Provider
class WakatimeVisualizerPanel {
    public static currentPanel: WakatimeVisualizerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.type === 'applyFilters') {
                    const queryParams = { ...message.filters };
                    const data = await fetchWakatimeData(queryParams);
                    if (data) {
                        const formattedData = aggregateHackatimeData(data)
                        this.updateContent(formattedData);
                    }
                }
            },
            undefined,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (WakatimeVisualizerPanel.currentPanel) {
            WakatimeVisualizerPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'hackatimeVisualizer',
            'HackaTime Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        WakatimeVisualizerPanel.currentPanel = new WakatimeVisualizerPanel(panel, extensionUri);
    }

    public updateContent(data: any) {
        this._panel.webview.postMessage({ type: 'update', data });
    }

    private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
        return `
<!DOCTYPE html>
<html lang="en">
<!-- Previous head and style sections remain the same -->
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hackatime Dashboard</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.7.0/chart.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            transition: all 0.3s ease;
        }

        body {
            padding: 24px;
            color: #e4e4e7;
            background-color: #09090b;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .dashboard-header {
            margin-bottom: 24px;
            opacity: 0;
            animation: fadeIn 0.5s ease forwards;
        }

        .filter-container {
            background: #18181b;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 24px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            opacity: 0;
            animation: slideUp 0.5s ease forwards;
        }

        .input-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .input-group label {
            font-size: 0.875rem;
            color: #a1a1aa;
        }

        .input-group input,
        .input-group select {
            background: #27272a;
            border: 1px solid #3f3f46;
            border-radius: 6px;
            padding: 8px 12px;
            color: #e4e4e7;
            font-size: 0.875rem;
            outline: none;
            width: 100%;
        }

        .input-group input:focus,
        .input-group select:focus {
            border-color: #6366f1;
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        button {
            background: #6366f1;
            color: white;
            border: none;
            border-radius: 6px;
            padding: 8px 16px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s ease;
            margin-top: 28px;
        }

        button:hover {
            background: #4f46e5;
            transform: translateY(-1px);
        }

        .total-time {
            background: #18181b;
            border-radius: 8px;
            padding: 24px;
            text-align: center;
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 24px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            opacity: 0;
            animation: slideUp 0.6s ease forwards;
        }

        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 24px;
            margin-bottom: 24px;
        }

        .chart-container {
            background: #18181b;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            opacity: 0;
            animation: slideUp 0.7s ease forwards;
            height: 400px;
        }

        .chart-container h3 {
            margin-bottom: 16px;
            color: #e4e4e7;
            font-size: 1.125rem;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .footer {
            text-align: center;
            padding: 24px 0;
            color: #71717a;
            font-size: 0.875rem;
            opacity: 0;
            animation: fadeIn 0.8s ease forwards;
        }

        canvas {
            animation: fadeIn 1s ease;
        }
    </style>
</head>
<body>
    <div class="dashboard-header">
        <h1>Hackatime Dashboard</h1>
    </div>

    <div class="filter-container">
        <div class="input-group">
            <label>Range</label>
            <select id="rangeFilter">
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
                <option value="7_days">7 Days</option>
                <option value="last_7_days">Last 7 Days</option>
                <option value="30_days">30 Days</option>
                <option value="last_30_days">Last 30 Days</option>
                <option value="6_months">6 Months</option>
                <option value="last_6_months">Last 6 Months</option>
                <option value="12_months">12 Months</option>
                <option value="last_12_months">Last 12 Months</option>
                <option value="last_year">Last Year</option>
                <option value="any">Any</option>
                <option value="all_time">All Time</option>
                <option value="low_skies">Low Skies</option>
            </select>
        </div>
        <div class="input-group">
            <label>Start Date</label>
            <input type="date" id="startDate">
        </div>
        <div class="input-group">
            <label>End Date</label>
            <input type="date" id="endDate">
        </div>
        <div class="input-group">
            <label>Project</label>
            <input type="text" id="projectFilter" placeholder="Enter project name">
        </div>
        <div class="input-group">
            <label>Language</label>
            <input type="text" id="languageFilter" placeholder="Enter language">
        </div>
        <div class="input-group">
            <button id="applyFilters">Apply Filters</button>
        </div>
    </div>

    <div class="total-time" id="totalTime"></div>

    <div class="dashboard-grid">
        <div class="chart-container">
            <h3>Languages</h3>
            <canvas id="languagesChart"></canvas>
        </div>
        <div class="chart-container">
            <h3>Categories</h3>
            <canvas id="categoriesChart"></canvas>
        </div>
        <div class="chart-container">
            <h3>Editors</h3>
            <canvas id="editorsChart"></canvas>
        </div>
        <div class="chart-container">
            <h3>Projects</h3>
            <canvas id="projectsChart"></canvas>
        </div>
    </div>

    <div class="footer">
        © 2024 Hackatime Dashboard
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const charts = {};

        // Define color palette
        const colors = {
            primary: [
                '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#f97316', '#a855f7', '#06b6d4',
                '#5b21b6', '#9333ea', '#e11d48', '#10b981', '#e4e4e7', '#2563eb', '#f97316', '#ea580c',
                '#3b82f6', '#ff7f2a', '#7b73d4', '#9b1d2c', '#bd5e02', '#8c05c3', '#9747ff', '#ff61a6',
                '#59c4d4', '#7f42ab', '#ea5e07', '#ba2d83', '#9c7dd1', '#1f9f90'
            ],
            secondary: [
                '#4f46e5', '#7c3aed', '#db2777', '#0d9488', '#e11d48', '#ea580c', '#9333ea', '#0891b2',
                '#8b5cf6', '#6d28d9', '#e879f9', '#d97706', '#10b981', '#15803d', '#d97706', '#37a0a9',
                '#f59e0b', '#e4a8a9', '#84cc16', '#c026d3', '#45b9d3', '#8c4a3f', '#d7b0f7', '#e16b69',
                '#973dbf', '#ea580c', '#ed4dff', '#8f4d60', '#b58bb5', '#6b39f7'
            ],
            background: '#18181b',
            text: '#e4e4e7',
            grid: '#27272a',
            tooltip: {
                background: '#27272a',
                border: '#3f3f46'
            }
        };

        // Chart.js global defaults
        Chart.defaults.color = colors.text;
        Chart.defaults.borderColor = colors.grid;
        Chart.defaults.plugins.tooltip.backgroundColor = colors.tooltip.background;
        Chart.defaults.plugins.tooltip.borderColor = colors.tooltip.border;
        Chart.defaults.plugins.tooltip.borderWidth = 1;
        Chart.defaults.plugins.tooltip.padding = 12;
        Chart.defaults.plugins.legend.labels.color = colors.text;

        // Common chart options
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 800,
                easing: 'easeInOutQuart'
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: {
                            size: 12
                        }
                    }
                },
            }
        };

        function createOrUpdateChart(id, config) {
            config.options = { ...commonOptions, ...config.options };
            
            if (charts[id]) {
                charts[id].destroy();
            }
            
            const ctx = document.getElementById(id).getContext('2d');
            charts[id] = new Chart(ctx, config);
        }

        function updateContent(data) {
            const summaryData = data.data[0];

            document.getElementById('totalTime').textContent = 
                'Total Coding Time: ' + summaryData.grand_total.text;

            const maxItems = 30;
            const limitedLanguages = summaryData.languages.slice(0, maxItems);
            const limitedCategories = summaryData.categories.slice(0, maxItems);
            const limitedEditors = summaryData.editors.slice(0, maxItems);
            const limitedProjects = summaryData.projects.slice(0, maxItems);
            // Languages Chart
            createOrUpdateChart('languagesChart', {
                type: 'doughnut',
                data: {
                    labels: limitedLanguages.map(l => l.name),
                    datasets: [{
                        data: limitedLanguages.map(l => l.percent),
                        backgroundColor: colors.primary,
                        borderColor: colors.background,
                        borderWidth: 2,
                        hoverOffset: 4
                    }]
                },
                options: {
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'right'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(tooltipItem) {
                                    const index = tooltipItem.dataIndex;
                                    const hours = (limitedLanguages[index].total_seconds / 3600).toFixed(2); // Convert seconds to hours
                                    return hours + ' hours'; // Show hours instead of percentage
                                }
                            }
                        }
                    }
                }
            });


            // Categories Chart
            createOrUpdateChart('categoriesChart', {
                type: 'pie',
                data: {
                    labels: limitedCategories.map(c => c.name),
                    datasets: [{
                        data: limitedCategories.map(c => c.percent),
                        backgroundColor: colors.primary,
                        borderColor: colors.background,
                        borderWidth: 2,
                        hoverOffset: 4
                    }]
                },
                options: {
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'right'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(tooltipItem) {
                                    const index = tooltipItem.dataIndex;
                                    const hours = (limitedCategories[index].total_seconds / 3600).toFixed(2); // Convert seconds to hours
                                    return hours + ' hours'; // Show hours instead of percentage
                                }
                            }
                        }
                    }
                }
            });


            // Editors Chart as Pie Chart
            createOrUpdateChart('editorsChart', {
                type: 'pie',
                data: {
                    labels: limitedEditors.map(e => e.name),
                    datasets: [{
                        data: limitedEditors.map(e => e.percent),
                        backgroundColor: colors.primary,
                        borderColor: colors.background,
                        borderWidth: 2,
                        hoverOffset: 4
                    }]
                },
                options: {
                    plugins: {
                        legend: { position: 'right' },
                        tooltip: {
                            callbacks: {
                                label: function(tooltipItem) {
                                    const percentage = tooltipItem.raw; // Raw value is the percentage
                                    return percentage + '%'; // Show percentage symbol
                                }
                            }
                        }
                    }
                }
            });


            // Projects Chart as Pie Chart
            createOrUpdateChart('projectsChart', {
                type: 'pie',
                data: {
                    labels: limitedProjects.map(p => p.name),
                    datasets: [{
                        data: limitedProjects.map(p => (p.total_seconds / 3600).toFixed(2)), // Hours already converted
                        backgroundColor: colors.primary,
                        borderColor: colors.background,
                        borderWidth: 2,
                        hoverOffset: 4
                    }]
                },
                options: {
                    plugins: {
                        legend: { position: 'right' },
                        tooltip: {
                            callbacks: {
                                label: function(tooltipItem) {
                                    const hours = tooltipItem.raw; // Raw value is already in hours
                                    return hours + ' hours'; // Show hours on hover
                                }
                            }
                        }
                    }
                }
            });


        }

        // Event Listeners
        document.getElementById('applyFilters').addEventListener('click', () => {
            const filters = {
                range: document.getElementById('rangeFilter').value,
                start: document.getElementById('startDate').value,
                end: document.getElementById('endDate').value,
                project: document.getElementById('projectFilter').value,
                language: document.getElementById('languageFilter').value
            };
            vscode.postMessage({ type: 'applyFilters', filters });
        });

        window.addEventListener('message', (event) => {
            if (event.data.type === 'update') {
                updateContent(event.data.data);
            }
        });
    </script>
</body>
</html>
        `;
    }

    public dispose() {
        WakatimeVisualizerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) disposable.dispose();
        }
    }
}

// Fetch data
async function fetchWakatimeData(queryParams: { [key: string]: string }) {
    const homeDir = os.homedir();
    const wakatimeFilePath = path.join(homeDir, '.wakatime.cfg');
    if (!fs.existsSync(wakatimeFilePath)) {
        vscode.window.showErrorMessage(`The file .wakatime.cfg was not found in ${homeDir}`);
        return;
    }

    const fileContent = fs.readFileSync(wakatimeFilePath, 'utf-8');
    const apiKeyMatch = fileContent.match(/api_key\s*=\s*(.+)/);
    if (!apiKeyMatch || !apiKeyMatch[1]) {
        vscode.window.showErrorMessage('API Key not found in .wakatime.cfg');
        return;
    }

    const apiKey = apiKeyMatch[1].trim();
    const authorizationHeader = `Basic ${Buffer.from(apiKey).toString('base64')}`;
    const params = new URLSearchParams(queryParams);
    console.log(`https://waka.hackclub.com/api/compat/wakatime/v1/users/current/summaries?${params.toString()}`)
    try {
        const response = await axios.get(
            `https://waka.hackclub.com/api/compat/wakatime/v1/users/current/summaries?${params.toString()}`,
            {
                headers: {
                    Accept: 'application/json',
                    Authorization: authorizationHeader
                }
            }
        );
        console.log(response.data)
        return response.data;
    } catch (error) {
        vscode.window.showErrorMessage('Error fetching data from Hackatime API');
    }
}

interface HackatimeItem {
    name: string;
    total_seconds: number;
    hours: number;
    minutes: number;
    seconds: number;
    percent?: number;
    digital?: string;
    text?: string;
  }
  
  function aggregateHackatimeData(inputData: any) {
    // If input is already aggregated or doesn't have data, return as is
    if (!inputData.data || inputData.data.length <= 1) {
      return inputData;
    }
  
    // Calculate total seconds
    const totalSeconds = inputData.data.reduce((sum: number, d: any) => 
      sum + (d.grand_total?.total_seconds || 0), 0);
  
    // Aggregate function for array properties
    function aggregateArrayProperty(prop: string) {
      const allItems = inputData.data.flatMap((item: any) => item[prop] || []);
      
      return allItems.reduce((acc: any[], item: any) => {
        const existingItem = acc.find((c: any) => c.name === item.name);
        
        if (existingItem) {
          // Sum up numeric properties
          existingItem.total_seconds += item.total_seconds || 0;
          existingItem.hours += item.hours || 0;
          existingItem.minutes += item.minutes || 0;
          existingItem.seconds += item.seconds || 0;
          
          // Recalculate percent based on total seconds
          existingItem.percent = Number(((existingItem.total_seconds / totalSeconds) * 100).toFixed(2));
        } else {
          acc.push({...item});
        }
        
        return acc;
      }, []);
    }
  
    // Aggregate different properties
    const aggregatedCategories = aggregateArrayProperty('categories');
    const aggregatedEditors = aggregateArrayProperty('editors');
    const aggregatedLanguages = aggregateArrayProperty('languages');
    const aggregatedMachines = aggregateArrayProperty('machines');
    const aggregatedOperatingSystems = aggregateArrayProperty('operating_systems');
    const aggregatedProjects = aggregateArrayProperty('projects');
  
    // Construct aggregated data
    return {
      ...inputData,
      data: [{
        categories: aggregatedCategories,
        dependencies: [],
        editors: aggregatedEditors,
        languages: aggregatedLanguages,
        machines: aggregatedMachines,
        operating_systems: aggregatedOperatingSystems,
        projects: aggregatedProjects,
        grand_total: {
          digital: `${Math.floor(totalSeconds/3600)}:${Math.floor((totalSeconds%3600)/60).toString().padStart(2, '0')}`,
          hours: Math.floor(totalSeconds / 3600),
          minutes: Math.floor((totalSeconds % 3600) / 60),
          text: `${Math.floor(totalSeconds/3600)} hrs ${Math.floor((totalSeconds%3600)/60)} mins`,
          total_seconds: totalSeconds
        },
        range: {
          start: inputData.data[0].range.start,
          end: inputData.data[inputData.data.length - 1].range.end,
          timezone: inputData.data[0].range.timezone
        }
      }],
      cumulative_total: {
        decimal: (totalSeconds / 3600).toFixed(2),
        digital: `${Math.floor(totalSeconds/3600)}:${Math.floor((totalSeconds%3600)/60).toString().padStart(2, '0')}`,
        seconds: totalSeconds,
        text: `${Math.floor(totalSeconds/3600)} hrs ${Math.floor((totalSeconds%3600)/60)} mins`
      },
      daily_average: {
        ...inputData.daily_average,
        seconds: Math.floor(totalSeconds / inputData.data.length),
        text: `${Math.floor(totalSeconds/inputData.data.length/3600)} hrs ${Math.floor((totalSeconds/inputData.data.length%3600)/60)} mins`,
        text_including_other_language: `${Math.floor(totalSeconds/inputData.data.length/3600)} hrs ${Math.floor((totalSeconds/inputData.data.length%3600)/60)} mins`
      }
    };
  }

// Activate extension
export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('hackatime.showDashboard', async () => {
        WakatimeVisualizerPanel.createOrShow(context.extensionUri);

        const queryParams = { range: 'today' };
        const data = await fetchWakatimeData(queryParams);
        if (data && WakatimeVisualizerPanel.currentPanel) {
            WakatimeVisualizerPanel.currentPanel.updateContent(data);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}