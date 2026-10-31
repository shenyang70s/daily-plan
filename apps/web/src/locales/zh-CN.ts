export const text={
 brand:'Research Tasks',eyebrow:'YOUR RESEARCH, IN FOCUS',title:'把注意力，留给重要的研究。',
 loginTitle:'登录研究空间',loginDescription:'管理任务、安排时间，跟踪重要截止日期。',username:'用户名',password:'口令',login:'登录',loggingIn:'正在登录…',accountHelp:'尚无账号？请联系管理员创建。',
 checking:'正在连接研究空间…',unavailable:'暂时无法连接服务',retry:'重试',logout:'退出登录',greeting:'研究空间已就绪',
 setupNote:'当前已开放登录和偏好设置，任务管理页面将在后续阶段接入。',settings:'时间与偏好',timezone:'默认时区',workStart:'工作开始时间',workEnd:'工作结束时间',notify:'接收提醒',ai:'启用 AI 入口',save:'保存设置',saving:'正在保存…',saved:'设置已保存',footer:'任务、时间、提醒。让研究井然有序。',requestFailed:'操作失败，请稍后重试。',invalidResponse:'服务返回的数据不完整。',
 versionConflict:'记录已被更新，请刷新后再试。',sessionExpired:'登录已过期，请重新登录。',
 pageLabels:{today:'今天',inbox:'收集箱',tasks:'全部任务',calendar:'日历',submissions:'投稿追踪',settings:'设置',notFound:'页面未找到'},
 sectionLabels:{general:'通用',notifications:'通知',ai:'AI',integrations:'集成',account:'账户与数据'},
 pageDescriptions:{today:'专注今天需要推进的研究工作。',inbox:'先记录想法，再决定下一步。',tasks:'在同一个地方整理和跟踪研究任务。',calendar:'把工作时间与截止日期分别安排。',submissions:'跟踪投稿阶段、重要节点和时间来源。'},
 workspaceName:'个人研究空间',navigation:'主导航',settingsNavigation:'设置导航',openMenu:'打开导航',closeMenu:'关闭导航',skipToContent:'跳到主要内容',
 search:'全局搜索',searchPlaceholder:'搜索页面名称…',searchHelp:'此处搜索页面名称；查询任务、日历和投稿请切换到 AI 助手。',noSearchResults:'没有匹配的页面',noSearchResultsHelp:'试试“任务”“日历”或“设置”。',
 notifications:'通知中心',
 close:'关闭',backToToday:'返回今天',notFoundTitle:'找不到这个页面',notFoundHelp:'请检查地址，或通过左侧导航进入研究空间。',
 pendingTitle:'任务管理即将接入',pendingHelp:'这里将展示保存在账户中的真实任务。当前可以先设置时区、工作时间和使用偏好。',
 calendarPending:'日历功能待接入',calendarHelp:'日历事件和工作块接入后，可在具体时段安排任务；截止日期与工作时间分别保存。',
 submissionsPending:'投稿管理待接入',submissionsHelp:'投稿阶段、截止节点与来源核验接入后，将在这里统一管理。',
 taskDetail:'任务详情',submissionDetail:'投稿详情',detailPending:'详情功能待接入',detailHelp:'当前尚不能读取这条记录。功能开放后将根据账户权限加载实际内容。',
 integrationsPending:'暂无可用的外部集成',integrationsHelp:'CCF-DDL 导入与其他集成接入后，将在这里显示实际状态。',
 accountDataPending:'账户数据功能待接入',accountDataHelp:'数据导出和账户删除功能将在后续阶段开放。',currentAccount:'当前账户',
 openSettings:'设置使用偏好',contextTitle:'研究工作台',contextDescription:'从收集想法到安排工作，再到跟踪投稿节点，让研究按自己的节奏推进。',contextStatus:'已开放',contextAvailable:'任务、日历、投稿、提醒与 AI 方案',contextNext:'接下来',contextUpcoming:'计划管理与备份恢复',
 notificationSettingsNote:'关闭通知会暂停派发，重新开启后处理待发送提醒。静音模式按用户时区在 22:00–08:00 延后派发；已有通知始终可查看。',quiet:'静音模式',aiSettingsNote:'AI 使用 DeepSeek 解析输入；关闭后停止接受新的 AI 请求，普通任务功能不受影响。',proactive:'主动建议',
};

export const tasksText = {
  title: '任务标题', quickPlaceholder: '记录一个任务，只填标题即可…', quickCreate: '记录任务', creating: '正在记录…', advancedCreate: '详细创建', createTitle: '创建任务', create: '创建任务', created: '任务已创建',
  loading: '正在加载任务…', loadFailed: '任务加载失败', retry: '重试', loadMore: '加载更多', loadingMore: '正在加载…',
  inboxEmpty: '收集箱暂时没有任务', inboxEmptyHelp: '用上方输入框记录想法，之后再整理状态和期限。',
  todayEmpty: '今天没有待处理的任务', todayEmptyHelp: '今天到期、逾期或已安排工作块的任务会显示在这里。',
  allEmpty: '还没有任务', allEmptyHelp: '用上方输入框记录第一项研究工作。', filteredEmpty: '没有符合条件的任务', filteredEmptyHelp: '调整筛选条件，或清除筛选后再试。',
  search: '搜索任务', searchPlaceholder: '搜索标题或备注', allTypes: '全部类型', allStatuses: '全部状态', allPriorities: '全部优先级', allProjects: '全部课题', allDue: '全部期限', dueToday: '今天到期', overdue: '已逾期', noDue: '无截止日期', dueFrom: '截止日期从', dueTo: '截止日期至', clearFilters: '清除筛选', showArchived: '已归档', activeTasks: '未归档',
  type: '任务类型', status: '状态', priority: '优先级', project: '所属课题', noProject: '不关联课题', duration: '预计时长（分钟）', note: '备注', externalUrl: '外部链接',
  types: { experiment: '实验', paper_reading: '论文阅读', learning: '知识学习', research: '科研杂项', meeting_prep: '会议准备', personal: '个人事项', other: '其他' },
  statuses: { inbox: '收集箱', todo: '待办', in_progress: '进行中', done: '已完成', canceled: '已取消' }, priorities: { low: '低', normal: '普通', high: '高' },
  deadline: '截止时间', deadlineKind: '期限类型', none: '不设置', dateOnly: '仅日期', instant: '精确时刻', date: '截止日期', instantAt: '截止时刻（含 UTC 或偏移）', timezone: '来源时区', instantHelp: '例如 2026-11-10T23:59:59+08:00。精确时刻保留秒和来源时区；不会自动创建工作块。',
  complete: '完成', reopen: '重新打开', archive: '归档', archiveDone: '任务已归档', completed: '任务已完成', reopened: '任务已重新打开', save: '保存任务', saving: '正在保存…', saved: '任务已保存', invalidInput: '请检查标题、日期、链接和时长；精确时刻需包含 UTC 或偏移。',
  back: '返回全部任务', detailLoading: '正在加载任务详情…', notFound: '找不到这项任务', notFoundHelp: '任务可能已被删除，或当前账户没有访问权限。', refresh: '刷新最新版本', version: '版本', scheduleNote: '截止时间与工作块分别保存。调整期限不会移动已安排的工作时间。',
  remove: '删除任务', confirmRemove: '确认删除任务', removeHelp: '删除后任务将从列表中隐藏，可在 24 小时内恢复。', cancel: '取消', removing: '正在删除…', removed: '任务已删除', undo: '撤销', restored: '任务已恢复',
  projectManage: '管理课题', projectName: '课题名称', projectCreate: '创建课题', projectCreated: '课题已创建', projectRename: '重命名', projectSave: '保存名称', projectSaved: '课题已更新', projectRemove: '删除课题', projectRemoved: '课题已删除', projectRemoveHelp: '删除课题只会移除任务关联，不会删除任务。', projectEmpty: '还没有课题', projectEmptyHelp: '课题用于整理研究方向；任务也可以不关联课题。',
  detail: '查看详情', completedGroup: '今天已完成', overdueGroup: '逾期任务', dueGroup: '今天的任务', projectUnavailable: '课题列表加载失败', filterLabel: '任务筛选', confirm: '确认',
};

export const calendarText = {
  title: '日历', day: '日', week: '周', month: '月', today: '今天', previous: '上一段日期', next: '下一段日期', chooseDate: '查看日期', timezone: '显示时区',
  loading: '正在加载日历…', failed: '日历加载失败', retry: '重试', noItems: '当前日期范围没有安排', slotHelp: '点击具体时段记录任务或固定事件。截止日期与工作块分别保存。',
  newSchedule: '安排工作', editEvent: '事件详情', editBlock: '工作块详情', mode: '安排类型', newTask: '新建任务并安排', existingTask: '安排已有任务', fixedEvent: '固定事件 / 会议',
  taskTitle: '任务标题', eventTitle: '事件名称', start: '开始时间', end: '结束时间', sourceTimezone: '安排时区', location: '地点', link: '会议链接', note: '备注', preparation: '准备任务标题（可选）', preparationHelp: '填写后会同时创建一项关联的会议准备任务。删除会议不会删除该任务。',
  due: '任务截止日期（可选）', dueHelp: '留空表示无截止日期。这里的工作时间不会自动成为截止时间。', chooseTask: '选择任务', tasksLoading: '正在加载可安排任务…', noTasks: '暂无可安排任务，请先记录任务或选择新建任务。',
  save: '保存安排', saving: '正在保存…', saved: '安排已保存', invalidTime: '请检查起止时间和时区。不存在或重复的夏令时时刻不能自动确定；重复时刻可填写有效偏移。',
  offsetHelp: '夏令时重复时刻的偏移', startOffset: '开始时刻偏移（可选）', endOffset: '结束时刻偏移（可选）', offsetExample: '例如 -07:00',
  conflictTitle: '这个时段已有安排', conflictHelp: '保存会保留重叠安排，不会移动已有事件或工作块。请核对本次起止时间和以下冲突。', conflictAccept: '我已核对，确认保留这些重叠安排', conflictSave: '确认保存重叠安排', backToEdit: '返回修改',
  removeEvent: '删除事件', cancelBlock: '取消工作块', removeHelp: '事件将从日历删除，关联的准备任务会保留。', cancelHelp: '只取消这段工作时间，不修改或删除任务及其截止时间。', confirm: '确认', cancel: '取消', removed: '安排已移除', refresh: '刷新最新版本',
  taskLink: '打开任务详情', preparationTasks: '关联的准备任务', notFound: '找不到这项安排', notFoundHelp: '安排可能已被移除，或当前账户没有访问权限。',
  allDay: '日期型期限', milestone: '截止', event: '事件', block: '工作块', continue: '跨日', createSlot: '创建安排', weekDays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
};

export const submissionText = {
  title: '投稿追踪', add: '添加投稿', createTitle: '新建投稿', name: '会议 / 期刊名称', year: '年份（可选）', round: '轮次（可选）', stage: '投稿阶段', submissionUrl: '投稿系统链接', draftUrl: '草稿链接', nextAction: '下一步行动',
  stages: { planning: '计划中', preparing: '准备中', internal_review: '内部审阅', submitted: '已提交', under_review: '审稿中', rebuttal: '答辩中', decision: '等待决定', accepted: '已录用', rejected: '未录用', withdrawn: '已撤回' },
  kinds: { abstract: '摘要', full_paper: '全文', rebuttal: '答辩', notification: '结果通知', camera_ready: '最终稿', other: '其他节点' },
  search: '搜索投稿', searchPlaceholder: '搜索名称、轮次或下一步行动', allStages: '全部阶段', active: '正在跟进', archived: '已归档', archiveFilter: '归档状态', clearFilters: '清除筛选', loadMore: '加载更多', loading: '正在加载投稿…', retry: '重试', unavailable: '投稿加载失败',
  empty: '还没有投稿记录', emptyHelp: '添加会议或期刊，分别维护摘要、全文和其他重要节点。', filteredEmpty: '没有符合条件的投稿', filteredEmptyHelp: '调整阶段或关键词，或清除筛选后再试。',
  detail: '投稿详情', back: '返回投稿列表', save: '保存投稿', saving: '正在保存…', created: '投稿已创建', saved: '投稿已保存', create: '创建投稿', invalidInput: '请检查名称、年份、轮次和链接，链接仅支持 HTTP 或 HTTPS。', refresh: '刷新最新版本', notFound: '找不到这条投稿', notFoundHelp: '记录可能不存在，或当前账户没有访问权限。',
  archive: '归档投稿', archiveTitle: '确认归档投稿', archiveHelp: '归档会保留阶段、节点和来源，并从正在跟进的列表及日历隐藏。之后可以恢复。', restore: '恢复投稿', archivedDone: '投稿已归档', restored: '投稿已恢复', archivedNote: '这条投稿已归档，恢复后可继续编辑节点与来源。', cancel: '取消', confirm: '确认归档',
  milestones: '截止节点', addMilestone: '添加节点', createMilestone: '新建截止节点', editMilestone: '编辑截止节点', kind: '节点类型', deadlineKind: '时间类型', unknown: '待定', dateOnly: '仅日期', instant: '精确时刻', date: '截止日期', localDateTime: '来源本地时刻', sourceTimezone: '来源时区', timezoneHint: '例如 AoE、PT 或 Asia/Shanghai；待定节点不需要补日期。', offset: '夏令时偏移（可选）', offsetHint: '重复时刻可填写 -07:00 或 -08:00；不存在的时刻不能保存。',
  sourceUrl: '来源链接', officialUrl: '官网链接', verifiedAt: '核实时间（ISO，可选）', markVerified: '标记现在已核实', notVerified: '尚未核实', noSource: '未提供来源',
  saveMilestone: '保存节点', preview: '预览修改', milestoneCreated: '节点已创建', milestoneSaved: '节点已更新', invalidMilestone: '请检查节点、时间、时区、来源链接和核实时间。',
  previewTitle: '核对节点与来源的修改', before: '修改前', after: '修改后', confirmEdit: '我已核对截止时间和来源，确认修改', confirmSave: '确认修改节点', backToEdit: '返回修改',
  removeMilestone: '删除节点', removeTitle: '确认删除截止节点', removeHelp: '节点及其来源将被删除，投稿记录会保留。请确认要删除的节点。', confirmRemove: '我确认删除这个节点', removeConfirm: '确认删除节点', removed: '节点已删除',
  noMilestones: '尚未设置截止节点', noMilestonesHelp: '日期尚未公布时可添加待定节点，不会被补成今天。', nextMilestone: '下一节点', nextUnknown: '暂无已知的后续节点', localTime: '当前时区', sourceTime: '来源时间', dateMeaning: '仅日期，不换算为午夜时刻', deadlineUnknown: '时间待定', passed: '已截止', dueToday: '今天截止', remainingDays: '天后截止', remaining: '距截止', dayUnit: '天', hourUnit: '时', minuteUnit: '分', secondUnit: '秒', version: '版本',
};

export const conferenceText = {
  choose: '从 CCF-DDL 选择顶会', manual: '手动创建', loading: '正在读取 CCF-Deadlines 会议目录…', unavailable: '会议目录加载失败', retry: '重新加载目录',
  topOnly: '仅显示相关 CCF A 类会议', focusNote: '方向标签由本应用整理，表示研究相关性，不代表会议设有 SNN 专属赛道。', focuses: { systems: '系统', ai: 'AI', edge: '边缘智能', snn: 'SNN 相关' }, all: '全部相关顶会', focus: '会议方向',
  search: '搜索会议', searchPlaceholder: '搜索 OSDI、ICLR、NeurIPS…', year: '会议年份', allYears: '全部年份', empty: '没有符合条件的顶会', emptyHelp: '调整方向、年份或关键词；也可以切换到手动创建。',
  stale: '暂时无法更新，正在使用已保存的真实快照。', fetchedAt: '快照抓取时间', checkedAt: '目录检查时间', source: '查看 CCF-DDL 来源', official: '会议官网', select: '选择会议后自动预填，并预览将带入的截止节点。', preview: '将带入的截止节点', unverified: '时间来自 CCF-DDL，尚未核实官网；23:59:59 和 AoE 可能为上游约定默认值。TBD 保留待定。',
  rank: 'CCF A', round: '轮次', mainRound: '主轮次', closed: '投稿已截止', deadlineUnknown: '投稿截止待定', currentTimezone: '当前时区', original: '来源原文', cannotImport: '来源信息不足，不能自动带入节点',
  create: '创建投稿并带入节点', created: '投稿及会议节点已创建', existing: '该会议已建档，保留现有内容并打开已有投稿', bound: '名称、年份和轮次来自所选会议；如需自定义，请切换到手动创建。', provenance: '会议数据来源', version: '来源版本', snapshot: '原始及已接受版本的来源快照均保留；节点可保留本地修订，请以各节点的来源和核实状态为准。目录更新不会自动覆盖。',
};

export const reminderText = {
  title: '提醒', add: '添加提醒', edit: '编辑提醒', retry: '重新安排', cancelReminder: '取消提醒', cancel: '取消', save: '保存提醒', refresh: '刷新', loading: '正在加载提醒…',
  mode: '提醒方式', relative: '跟随目标期限', absolute: '指定时刻', timezone: '提醒时区', at: '提醒时刻', offset: '提前分钟数', dateTime: '日期型期限的提醒基准时刻',
  policy: '提醒由服务端保存和调度。通知偏好与静音时段可能延后派发。', relativeHelp: '尚未触发的相对提醒会跟随期限调整；日期型期限必须明确时刻和时区。', absoluteHelp: '指定时刻不会随目标期限变化。夏令时重复或缺失时刻请改用 UTC 时区填写。',
  invalidTime: '提醒时间或时区无效，请检查夏令时与时区填写。', failed: '投递失败，请重新安排', states: { pending: '待触发', sent: '已发送', canceled: '已取消' },
  unread: '未读', empty: '暂无通知', read: '标记已读', snooze: '10 分钟后提醒', snoozedUntil: '已安排稍后提醒：', more: '加载更多', centerHelp: '服务端生成的通知会保留在这里。关闭浏览器后仍可在下次登录查看。',
} as const;

export const pushText = {
  title: '浏览器推送', help: '主动开启后，可在关闭页面时接收通用系统提醒。订阅绑定本次登录会话，退出或会话失效后停止发送；重新登录请再次开启。应用内通知始终保留。',
  loading: '正在检查浏览器推送…', unsupported: '当前浏览器或访问地址不支持推送，请使用支持推送的浏览器与 HTTPS（本机开发可用 localhost 或 127.0.0.1）。',
  unconfigured: '服务端尚未配置推送密钥，当前使用应用内通知。', denied: '浏览器通知权限已拒绝，请在站点权限中允许后刷新。', active: '此浏览器已开启推送', inactive: '此浏览器尚未为当前会话开启推送',
  browserFailed: '浏览器推送服务暂不可用，请检查站点权限和网络后重试；应用内通知不受影响。', enable: '开启此浏览器推送', disable: '停用此浏览器推送', refresh: '刷新推送状态', delivery: '最近投递状态', deliveryError: '投递遇到问题，请查看应用内通知；订阅失效时请重新开启',
  states: { pending: '等待发送', running: '发送中', sent: '推送服务已接受', failed: '发送失败', canceled: '已取消' },
} as const;

export const aiText = {
  tab: 'AI 助手', navigation: '页面导航', help: '结合当前账户的任务、日程、课题、投稿节点和提醒生成方案，也可以查询已有记录。你可连续修改，确认后才执行。',
  loading: '正在检查 AI 服务…', disabled: 'AI 已在偏好设置中关闭。', settings: '打开 AI 设置', unconfigured: 'DeepSeek 尚未配置，请在服务端设置 DEEPSEEK_API_KEY。页面导航和普通任务功能仍可使用。',
  input: '告诉 AI 你想做什么', placeholder: '例如：今天有哪些任务？ / 查询本周日历 / 明天下午看论文', submit: '解析', running: '正在解析…', stop: '停止解析', refresh: '刷新',
  clarification: '需要补充信息', clarificationHelp: '在上方直接补充回答，AI 会结合此前对话继续生成方案。', draft: '任务草案', draftHelp: '这是旧格式草案，尚未创建。请继续输入要求，生成可确认的新方案。',
  title: '标题', due: '期限', note: '备注', noDue: '无期限 · 收集箱', dateOnly: '仅日期', manual: '前往任务页面手动创建',
  resources: { tasks: '任务查询结果', calendar: '日历查询结果', submissions: '投稿查询结果' }, items: '项', actualData: '来自当前账户的实际记录', empty: '没有符合条件的记录。', truncated: '仅展示前 30 项，请补充筛选条件或进入对应列表继续查看。',
  phases: { queued: '等待解析…', interpreting: 'DeepSeek 正在解析意图…', querying: '正在查询当前账户的数据…', completed: '解析完成', failed: '解析失败', canceled: '解析已停止' },
} as const;
