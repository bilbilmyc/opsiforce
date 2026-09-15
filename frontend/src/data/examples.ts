import { t } from '~/i18n';
export interface Example {
  title: string;
  description: string;
  prompt: string;
  category: string;
  icon: string;
  gradient: string;
}

export const EXAMPLES: Example[] = [
  {
    get title() { return t("Sales Dashboard"); },
    get description() { return t("Interactive charts tracking revenue, deals, and monthly trends"); },
    get prompt() { return t("Build a sales analytics dashboard web app with interactive charts showing monthly revenue, deal pipeline, top products by revenue, and a comparison to the previous period. Use a clean, modern design with a sidebar nav."); },
    category: 'dashboard',
    icon: '📈',
    gradient: 'from-blue-500 to-indigo-600',
  },
  {
    get title() { return t("KPI Tracker"); },
    get description() { return t("Team metrics board with goal progress and trend indicators"); },
    get prompt() { return t("Create a KPI tracking web app where team members can add goals, log daily progress, and view trend charts. Show a summary dashboard with progress rings, sparkline charts, and a color-coded status for each metric."); },
    category: 'dashboard',
    icon: '🎯',
    gradient: 'from-violet-500 to-purple-600',
  },
  {
    get title() { return t("Analytics App"); },
    get description() { return t("Real-time data visualization with filterable chart views"); },
    get prompt() { return t("Build a data analytics web app that takes a CSV or JSON data source, displays it as interactive bar, line, and pie charts, and lets users filter by date range and category. Include a summary stats row at the top."); },
    category: 'app',
    icon: '📊',
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    get title() { return t("Inventory Manager"); },
    get description() { return t("Product catalog with stock levels, alerts, and a summary view"); },
    get prompt() { return t("Create an inventory management web app with a product table showing name, SKU, quantity, and status. Include add/edit/delete operations, low-stock highlighting, a search bar, and a dashboard showing total items, low stock count, and value."); },
    category: 'app',
    icon: '📦',
    gradient: 'from-amber-500 to-orange-600',
  },
];
