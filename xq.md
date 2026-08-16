## 一、技术方案选型对比

实现股票复盘时序图，当前主流的开源方案各有侧重：

| 方案 | 适用场景 | 优势 | 局限性 |
|------|----------|------|--------|
| **ECharts + Timeline** | 轻量级时间轴动态图表 | Timeline组件成熟，配置简单，社区活跃，免费商用 | 金融专用图表（K线）需二次封装 |
| **AmCharts Stock Chart** | 专业级金融时序看板 | 内置K线、MACD/RSI等指标、时间轴缩放，开箱即用 | 商用需付费授权（非开源） |
| **react-stockcharts** | React技术栈高定制项目 | 专为股票市场设计，支持K线、OHLC、技术指标，高度可定制 | 维护活跃度下降，学习曲线较陡 |
| **D3.js 自研** | 复杂自定义交互需求 | 灵活性最高，可完全按需定制 | 开发成本最高，需自己处理缩放/拖拽等交互 |
| **AntV G2** | 底层图形语法定制 | 数据驱动，图形语法灵活 | 金融专用组件不如AmCharts丰富 |
| **vis-timeline** | 侧重事件/里程碑展示 | 专注时间轴事件可视化 | 金融图表能力弱 |

**推荐方案：ECharts（Timeline动态图表）**——轻量、免费、社区成熟，配合自定义Tooltip可很好地展示概念板块和领涨个股信息。

---

## 二、核心设计

### 2.1 设计定位与图表形态选择

该类图表的本质是“**主题轮动时间轴**”，而非传统的K线走势图。用户的核心诉求是：在时间轴上快速识别——**当天哪个概念在涨、涨了多少、领涨股是谁、持续时间多长**。

因此，图表形态上推荐：

- **横轴（X轴）** ：连续交易日，按日期线性分布
- **纵轴（Y轴）** ：按概念主题分组，每个概念占据一个水平轨道（泳道），当日若有该概念就显示对应色块
- **色块编码**：色块长度表示概念持续天数，颜色深浅表示涨幅强度（涨超5%为红色，2%-5%为橙色，微涨为浅红）
- **鼠标悬浮**：显示该日概念详情（领涨个股、涨停家数、成交额等）

这种“泳道式”设计（类似甘特图思路），可让用户在横向上快速理解每个概念的起涨时间、持续热度、以及是否出现卡位切换；在纵向上快速看到当日有哪些概念在共振、哪个是主线。

### 2.2 数据结构设计

```typescript
// 概念轮动数据模型
interface ConceptTimeline {
  date: string;           // 交易日 YYYY-MM-DD
  concepts: ConceptNode[];// 当日活跃的概念列表
}

interface ConceptNode {
  name: string;           // 概念名称，如"人工智能"
  rank: number;           // 热度排名
  changePercent: number;  // 板块涨幅 (%- 红/绿)
  leadingStocks: LeadingStock[]; // 领涨个股列表
  totalUpCount: number;   // 板块内涨停家数
  totalStocks: number;    // 板块内成分股总数
  turnover: number;       // 板块成交额 (亿元)
  duration: number;       // 该轮行情持续天数
  isNew: boolean;         // 是否当日新启动
}

interface LeadingStock {
  code: string;           // 股票代码
  name: string;           // 股票名称
  changePercent: number;  // 当日涨幅
  consecutiveLimit: number; // 连板天数（如适用）
  zdt: boolean;           // 是否涨停
}
```

### 2.3 交互流程设计

```
用户打开页面
    │
    ▼
┌─────────────────────────────────────┐
│  时序图加载 → 默认展示近30个交易日      │
│  + 默认播放时间轴动画（可选）           │
└─────────────────────────────────────┘
    │
    ▼
用户交互方式：
    ├── ▶ 点击时间轴刻度 → 图表切换到该日概念排名视图
    ├── ▶ 鼠标悬浮日期节点 → Tooltip展示当日概念热度排行
    ├── ▶ 点击概念色块 → 右侧面板展示该概念全部成分股列表
    ├── ▶ 双击个股标签 → 跳转至个股详情页或弹窗K线
    ├── ▶ 范围选择 → 框选时间区间，查看区间概念持续性统计
    └── ▶ 导出 → 导出当前视图为图片或CSV
```

---

## 三、关键技术实现（ECharts + Timeline）

### 3.1 基础配置代码

```typescript
// 1. 初始化 ECharts 实例
const chartDom = document.getElementById('review-timeline-chart');
const myChart = echarts.init(chartDom);

// 2. 模拟数据
const timelineData = ['2026-01-13', '2026-01-14', '2026-01-15'];
const optionsConfig = [
  {
    title: { text: '2026-01-13 概念热度排行' },
    dataset: {
      source: [
        ['Concept', '涨幅(%)', '领涨股', '涨停家数'],
        ['人工智能', 5.2, '科大讯飞', 12],
        ['AIGC概念', 4.8, '万兴科技', 8],
        ['机器人', 4.3, '绿的谐波', 6],
        ['汽车零部件', 3.9, '华阳集团', 5]
      ]
    },
    xAxis: { type: 'category' },
    yAxis: { type: 'value', name: '涨幅(%)' },
    series: [{ type: 'bar', encode: { x: 'Concept', y: '涨幅(%)' }, itemStyle: {
      color: (params: any) => params.value[1] > 0 ? '#ef4444' : '#22c55e'
    } }]
  },
  // 2026-01-14 和 2026-01-15 的配置类似...
];

// 3. Timeline 配置（核心）
const option = {
  timeline: {
    data: timelineData,
    axisType: 'category',
    autoPlay: true,         // 自动播放
    playInterval: 2000,     // 播放间隔 2 秒
    loop: true,             // 循环播放
    symbol: 'circle',
    symbolSize: 10,
    left: '5%',
    right: '5%',
    bottom: 50,
    lineStyle: { color: '#c0c0c0', width: 2 },
    label: {
      rotate: 45,           // 日期标签旋转45度，避免重叠
      fontSize: 12,
      interval: 0           // 显示所有标签（或用函数动态计算密度）
    },
    checkpointStyle: { color: '#ff6600', borderWidth: 2 }
  },
  options: optionsConfig
};

myChart.setOption(option);
```

这段代码使用 ECharts 的 Timeline 组件，通过 `timeline.data` 定义日期数组，`options` 中为每个日期配置对应的图表内容。`autoPlay` 和 `playInterval` 实现自动播放复盘效果。

### 3.2 针对长日期序列（如近一年数据）的性能优化

当数据量较大时（如 200+ 个交易日），直接配置 `options` 数组会占用较大内存。**推荐采用“懒加载 + 动态渲染”策略**：

```typescript
// 懒加载优化示例
let dataCache = new Map();  // 缓存已加载的图表配置

myChart.on('timelinechanged', (params: any) => {
  const currentIndex = params.currentIndex;
  const dateKey = timelineData[currentIndex];
  
  // 检查缓存
  if (!dataCache.has(dateKey)) {
    // 异步加载该日期的完整数据并生成配置
    fetchConceptData(dateKey).then(conceptData => {
      const chartOption = buildOptionByDate(conceptData);
      dataCache.set(dateKey, chartOption);
      // 仅更新 options 中对应位置的配置
      const newOptions = [...option.options];
      newOptions[currentIndex] = chartOption;
      myChart.setOption({ options: newOptions });
    });
  }
});
```

核心思路：初始加载时仅缓存近 10-15 个交易日的数据；用户滑动时间轴触发 `timelinechanged` 事件时，按需加载并缓存对应日期的配置。建议同时开启服务端分页，接口一次性返回当日概念排名与领涨个股即可。

### 3.3 Tooltip 展示领涨个股详情

ECharts 支持通过 `formatter` 函数自定义提示框内容，此处扩展展示领涨个股信息：

```typescript
tooltip: {
  trigger: 'axis',
  axisPointer: { type: 'shadow' },
  formatter: function(params: any) {
    const date = params[0].axisValue;
    const concept = params[0].name;
    // 从 dataMap 中获取该日概念的完整信息
    const dayData = dataMap[date];
    const conceptInfo = dayData.concepts.find((c: any) => c.name === concept);
    if (!conceptInfo) return date;
    
    // 构建领涨个股列表 HTML
    const leadingStocksHtml = conceptInfo.leadingStocks.map((stock: any) => 
      `<span style="color: ${stock.changePercent > 0 ? '#ef4444' : '#22c55e'};">
         ${stock.name} ${stock.changePercent > 0 ? '+' : ''}${stock.changePercent}%
       </span>`
    ).join(' / ');
    
    return `
      <div style="font-weight:bold; margin-bottom:4px;">${date} - ${concept}</div>
      <div>板块涨幅: <span style="color:#ef4444;">+${conceptInfo.changePercent}%</span></div>
      <div>涨停家数: ${conceptInfo.totalUpCount} / ${conceptInfo.totalStocks}</div>
      <div>成交额: ${conceptInfo.turnover}亿</div>
      <div>领涨个股: ${leadingStocksHtml}</div>
    `;
  }
}
```

通过 Tooltip 内的个股标签，可以进一步绑定点击事件，实现跳转个股详情页或弹窗K线。

### 3.4 数据流架构

```
┌─────────────────────────────────────────────────────────────┐
│                         数据源层                              │
├─────────────────────────────────────────────────────────────┤
│   • stock-sdk (A股实时/历史行情)                  │
│   • Tushare / AkShare (概念板块、涨停个股数据)                 │
│   • 东方财富Choice / 同花顺iFinD 公开接口                      │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据加工与清洗层                          │
├─────────────────────────────────────────────────────────────┤
│   • 概念热度计算（涨跌幅排序 + 涨停占比加权）                    │
│   • 领涨个股抓取（涨幅前三的成分股）                            │
│   • 持续性标注（判断概念是否连续N日上榜）                       │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      状态管理与缓存层                          │
├─────────────────────────────────────────────────────────────┤
│   • React/Vue 状态管理 (Redux/Pinia)                         │
│   • IndexedDB / LocalStorage 持久化缓存                      │
│   • TTL 策略（实时行情2-3秒，板块列表更长）       │
└─────────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       可视化渲染层                             │
├─────────────────────────────────────────────────────────────┤
│   • ECharts 核心图表渲染                                      │
│   • Timeline 时间轴组件                                       │
│   • 自定义 Tooltip / 回调点击事件                              │
└─────────────────────────────────────────────────────────────┘
```

## 四、开源组件推荐清单

### 核心图表组件

| 组件 | 用途 | 地址 |
|------|------|------|
| ECharts | 基础图表绘制 + Timeline 时间轴 | https://echarts.apache.org |
| AntV G2 | 高自由度图形语法（备选） | https://antv.antgroup.com |
| uCharts | 跨平台图表库（小程序/移动端） | https://www.ucharts.cn  |

### 金融专用库（高度定制场景）

| 组件 | 用途 | 地址 |
|------|------|------|
| react-stockcharts | React技术栈专业K线/指标图表 | https://github.com/rrag/react-stockcharts  |
| D3.js | 完全自研的基础图形库 | https://d3js.org |
| Highstock | 专业时序图（商业项目需授权） | https://www.highcharts.com  |
| plotseries | R语言金融时序绘图（Python/R分析侧） | CRAN package  |

### 数据服务与SDK

| 组件 | 用途 | 地址 |
|------|------|------|
| stock-sdk | A股纯前端数据拉取 SDK | https://stock-sdk.linkdiary.cn  |
| OpenStock | 开源金融分析平台（含TradingView组件） | 搜索结果5  |

### 布局与辅助UI

| 组件 | 用途 | 地址 |
|------|------|------|
| dayjs / date-fns | 日期时间格式化与区间计算 | https://day.js.org |
| ahooks (useDebounce) | 图表缩放/滑动事件的防抖优化 | https://ahooks.js.org |

---

## 五、部署与数据更新机制

### 5.1 纯前端方案（最低部署成本）

参考 `stock-dashboard` 的纯前端架构：直接拉取 `stock-sdk` 数据，无后端、无定时脚本，可用 GitHub Pages / Vercel / Netlify 一键部署。适合个人复盘工具或中小团队内部使用，核心代码如下：

```typescript
// 引入 stock-sdk
import StockSDK from 'stock-sdk';

export const sdk = new StockSDK({
  timeout: 30000,
  retry: { maxRetries: 3, baseDelay: 1000 }
});

// 获取概念板块行情
const conceptQuotes = await sdk.getConceptQuotes();
// 获取当日领涨个股
const leadingStocks = await sdk.getTodayLeadingStocks();
```

### 5.2 服务端方案（团队/产品级使用）

对于产品化需求，推荐 **Node.js + Redis + PostgreSQL** 方案：

- **数据采集**：每日收盘后（15:30）定时任务调用 Tushare / AkShare API，拉取全市场概念板块和涨停个股数据，存入 PostgreSQL。
- **缓存层**：Redis 缓存每日热度排行结果，TTL 设置为 24 小时，次日收盘后自动失效并触发更新。
- **API 层**：提供 RESTful 接口 `/api/concept/timeline?start=2026-01-01&end=2026-01-31`，返回包含概念排名和领涨个股的完整时间序列数据。
- **前端配合**：ECharts 通过 AJAX 调用 API 获取数据后动态构建 Timeline 配置。

---

## 六、效果示意

### 6.1 桌面端最终呈现效果

```
┌────────────────────────────────────────────────────────────────────────┐
│  📊 概念板块轮动复盘时序图                    2026-01-13 ~ 2026-01-31  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  概念排名   ├──────2026-01-13──────┤├─────01-14─────┤├─────01-15─────┤│
│  1.人工智能 ┃████████████ 5.2%     ┃█████████ 2.1% ┃                ┃│
│            ┃ 领涨: 科大讯飞+8%     ┃ 领涨: 拓尔思  ┃                ┃│
│  2.AIGC    ┃███████████ 4.8%      ┃████████ 1.8% ┃                ┃│
│  3.机器人  ┃█████████ 4.3%        ┃              ┃                ┃│
│  4.汽车零部┃████████ 3.9%         ┃██████████ 2.5%┃████████ 1.2%  ┃│
│  5.芯片    ┃                      ┃█████████ 2.0%┃███████ 0.8%   ┃│
│  6.数据要素┃                      ┃              ┃█████████ 1.5%  ┃│
│                                                                        │
│  ════════════════════════════════════════════════════════════════════  │
│  ◀         2026-01-13          2026-01-14          2026-01-15       ▶ │
│  [▶ 自动播放] [⏸ 暂停] [⟳ 重置]                    时间轴拖动滑动条     │
└────────────────────────────────────────────────────────────────────────┘
```

### 6.2 鼠标悬浮交互的 Tooltip 效果

```
当鼠标悬浮在“人工智能”对应的2026-01-13色块上时，弹出浮动卡片：

┌─────────────────────────────────────────┐
│ 📅 2026-01-13  📌 人工智能 (排名第1)      │
├─────────────────────────────────────────┤
│ 板块涨幅   │ +5.2%  ████████████ 红色条  │
│ 涨停家数   │ 12 / 46 (26%)               │
│ 成交额     │ 386.5亿                     │
│ 持续天数   │ 3天 (新启动 🔥)             │
├─────────────────────────────────────────┤
│ 领涨个股排行：                           │
│ 1. 科大讯飞    +8.2%  (涨停板)          │
│ 2. 拓尔思      +7.6%                    │
│ 3. 浪潮信息    +6.9%                    │
│ 4. 中科曙光    +5.8%                    │
├─────────────────────────────────────────┤
│ [查看全部成分股] [导出此日数据]  [📈]      │
└─────────────────────────────────────────┘
```

### 6.3 设计资源与模板

原型设计可使用 Figma 上的金融设计资源快速构建：

- **Fin Chart for Figma**：Figma 插件，输入股票代码即可生成金融图表（目前支持K线图，可参考设计风格）。
- **Folioviz Design**：长期投资组合仪表盘设计，时间维度的展示方式可借鉴。
- **Stock Watch Dashboard UI**：Windows 桌面端股票监控仪表盘，列表+卡片+迷你图的设计思路适合复盘场景的二次扩展。
- **AntV G2 时间序列图示例**：在线可视化演示：https://antv.antgroup.com/zh/examples/gallery/line


# 数据源 

股票概念，每个概念下对应多个股票，概念产生的时间，概念编码
/home/zhen/works/Memoa/twine/data/股票概念.json

证监会行业， 每个行业下对应多个股票，行业产生的时间，行业编码
/home/zhen/works/Memoa/twine/data/证监会行业.json

股票数据来源于baostock ，目前日线已经下载到本地redis

上述时序图的计算可以从本地redis中读取数据（baostock）+ 本地概念、行业数据（json）
计算每个概念、行业在每个时间点的涨幅（存本地数据库），然后根据涨幅排序，绘制时序图