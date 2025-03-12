import { ItemView, WorkspaceLeaf, MarkdownRenderer, Modal, Notice, TFile, App, MarkdownView, Editor } from 'obsidian';

interface TodoItem {
    content: string;
    priority: string;
    completed: boolean;
    category: string;
}

interface MemoItem {
    time: string;
    content: string;
    tags?: string[];
}

interface TagInfo {
    tag: string;
    count: number;
    files: Set<string>;
}

interface TagNode {
    name: string;
    fullPath: string;
    count: number;
    files: Set<string>;
    children: Map<string, TagNode>;
}

export const VIEW_TYPE_CALENDAR = 'calendar-view';

export class CalendarView extends ItemView {
    calendar: HTMLElement;
    currentDate: Date;
    filesCache: Map<string, boolean>;
    private tagCache: Map<string, TagInfo>;
    private lastCacheUpdate: number;
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存时间
    private readonly DAILY_PATH = '01Inbox/daily';

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.currentDate = new Date();
        this.filesCache = new Map();
        this.tagCache = new Map();
        this.lastCacheUpdate = 0;
        
        // 启动标签缓存更新定时器
        this.startTagCacheUpdateInterval();
    }

    getViewType(): string {
        return VIEW_TYPE_CALENDAR;
    }

    getDisplayText(): string {
        return '日历视图';
    }

    async onOpen() {
        const container = this.contentEl.createDiv({ cls: 'calendar-container' });
        this.calendar = container.createDiv({ cls: 'calendar' });
        const contentEl = container.createDiv({ cls: 'daily-content' });

        // 缓存所有日期的文件信息
        await this.cacheFileDates();
        
        // 渲染日历
        this.renderCalendar();
        
        // 显示今天的内容
        this.updateDailyContent(this.currentDate);
        await this.updateTagCache();
    }

    async cacheFileDates() {
        const files = this.getDailyFiles();
        this.filesCache.clear();
        
        files.forEach(file => {
            const datePatterns = [
                /(\d{4}-\d{2}-\d{2})/, // YYYY-MM-DD
                /(\d{4})年(\d{2})月(\d{2})日/ // YYYY年MM月DD日
            ];

            for (const pattern of datePatterns) {
                const match = file.path.match(pattern);
                if (match) {
                    let dateStr;
                    if (match.length === 4) {
                        dateStr = `${match[1]}-${match[2]}-${match[3]}`;
                    } else if (match.length === 2) {
                        dateStr = match[1];
                    }
                    if (dateStr) {
                        this.filesCache.set(dateStr, true);
                        break;
                    }
                }
            }
        });
    }

    async renderCalendar() {
        this.calendar.empty();
        
        // 日历头部
        const header = this.calendar.createDiv({ cls: 'calendar-header' });
        
        // 上个月按钮
        const prevBtn = header.createEl('button', { text: '←' });
        prevBtn.onclick = () => {
            const newDate = new Date(this.currentDate);
            newDate.setMonth(newDate.getMonth() - 1);
            this.currentDate = newDate;
            this.renderCalendar();
            this.updateDailyContent(this.currentDate);
        };
        
        // 显示年月
        const titleEl = header.createEl('span', { 
            cls: 'calendar-title',
            text: this.currentDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })
        });
        
        // 下个月按钮
        const nextBtn = header.createEl('button', { text: '→' });
        nextBtn.onclick = () => {
            const newDate = new Date(this.currentDate);
            newDate.setMonth(newDate.getMonth() + 1);
            this.currentDate = newDate;
            this.renderCalendar();
            this.updateDailyContent(this.currentDate);
        };

        // 星期头部
        const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
        const weekHeader = this.calendar.createDiv({ cls: 'calendar-weekdays' });
        weekdays.forEach(day => {
            weekHeader.createEl('span', { text: day });
        });

        // 日期网格
        const grid = this.calendar.createDiv({ cls: 'calendar-grid' });
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // 获取当月第一天
        const firstDay = new Date(year, month, 1);
        // 获取当月最后一天
        const lastDay = new Date(year, month + 1, 0);
        
        // 计算需要显示的上个月的天数
        let firstDayWeekday = firstDay.getDay() || 7; // 将周日的0转换为7
        firstDayWeekday--; // 调整为从周一开始
        
        // 添加上个月的日期
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = firstDayWeekday - 1; i >= 0; i--) {
            const dayEl = this.createDayElement(prevMonthLastDay - i, true);
            grid.appendChild(dayEl);
        }

        // 添加当月的日期
        for (let date = 1; date <= lastDay.getDate(); date++) {
            const dayEl = this.createDayElement(date, false);
            // 使用 UTC 时间来避免时区问题
            const currentDate = new Date(Date.UTC(this.currentDate.getFullYear(), this.currentDate.getMonth(), date));
            const dateStr = currentDate.toISOString().split('T')[0];
            
            // 检查是否有日记
            if (this.filesCache.has(dateStr)) {
                dayEl.classList.add('has-notes');
            }
            
            // 检查是否是今天
            if (this.isToday(this.currentDate.getFullYear(), this.currentDate.getMonth(), date)) {
                dayEl.classList.add('today');
            }
            
            // 检查是否是选中的日期
            if (this.currentDate.getDate() === date) {
                dayEl.classList.add('selected');
            }
            
            // 添加点击事件
            dayEl.onclick = () => {
                // 使用 UTC 时间来避免时区问题
                const selectedDate = new Date(Date.UTC(this.currentDate.getFullYear(), this.currentDate.getMonth(), date));
                this.currentDate = selectedDate;
                this.updateDailyContent(selectedDate);
                
                // 移除其他日期的选中状态
                grid.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                dayEl.classList.add('selected');
            };
            
            grid.appendChild(dayEl);
        }
    }

    createDayElement(date: number, isPrevMonth: boolean): HTMLElement {
        const dayEl = document.createElement('span');
        dayEl.textContent = String(date);
        dayEl.classList.add('calendar-day');
        if (isPrevMonth) {
            dayEl.classList.add('other-month');
        }
        return dayEl;
    }

    isToday(year: number, month: number, date: number): boolean {
        const today = new Date();
        return today.getFullYear() === year && 
               today.getMonth() === month && 
               today.getDate() === date;
    }

    async updateDailyContent(date: Date) {
        const contentEl = this.contentEl.querySelector('.daily-content');
        if (!contentEl) {
            console.error('找不到内容元素');
            return;
        }

        try {
            // 清空内容
            contentEl.empty();
            
            // 添加日期标题和新建按钮
            const headerEl = contentEl.createDiv({ cls: 'daily-header' });
            headerEl.createEl('h2', {
                text: date.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    weekday: 'long'
                })
            });

            // const newNoteBtn = headerEl.createEl('button', {
            //     cls: 'new-note-button',
            //     text: '新建笔记'
            // });

            // 创建内容容器
            const contentContainer = contentEl.createDiv({ cls: 'content-container' });

            // 分别创建三个部分的容器
            const timelineSection = contentContainer.createDiv({ cls: 'timeline-section' });
            const todoSection = contentContainer.createDiv({ cls: 'todo-section' });
            const memoSection = contentContainer.createDiv({ cls: 'memo-section' });

            // 添加标题
            timelineSection.createEl('h3', { text: '⏳ 时间轨迹' });
            todoSection.createEl('h3', { text: '🎯 每日任务' });
            memoSection.createEl('h3', { text: '📝 Memo' });

            const dateString = this.getDateString(date);
            const formattedDate = this.formatChineseDate(date);
            
            const dateFormats = [dateString, formattedDate];
            const files = this.app.vault.getMarkdownFiles()
                .filter(file => dateFormats.some(format => file.path.includes(format)));

            // 设置新建按钮事件 - 移到这里，确保在所有情况下都可用
            // newNoteBtn.onclick = async () => {
            //     const fileName = `${dateString}.md`;
            //     try {
            //         const file = await this.app.vault.create(fileName, '');
            //         await this.app.workspace.getLeaf(false).openFile(file);
            //     } catch (error) {
            //         console.error('创建文件失败:', error);
            //     }
            // };

            // 如果没有文件，显示空状态
            if (files.length === 0) {
                timelineSection.createDiv({ 
                    cls: 'empty-state',
                    text: '暂无时间轨迹'
                });
                todoSection.createDiv({ 
                    cls: 'empty-state',
                    text: '暂无待办事项'
                });
                memoSection.createDiv({ 
                    cls: 'empty-state',
                    text: '暂无备忘录'
                });
                return;
            }

            // 处理文件内容
            for (const file of files) {
                try {
                    const content = await this.app.vault.cachedRead(file);
                    const sections = content.split(/^## /m);
                    
                    for (const section of sections) {
                        const sectionContent = section.trim();
                        // 移除原始标题，只保留内容
                        const contentWithoutTitle = sectionContent
                            .replace(/^[⏳🎯📝].*?\n/, '') // 移除emoji开头的标题行
                            .trim();

                        if (sectionContent.startsWith('⏳ 时间轨迹')) {
                            await MarkdownRenderer.renderMarkdown(
                                contentWithoutTitle,
                                timelineSection.createDiv(),
                                file.path,
                                this
                            );
                        }
                        else if (sectionContent.startsWith('🎯 每日任务')) {
                            // 移除优先级标题，只保留任务列表
                            const contentWithoutPriorityHeaders = contentWithoutTitle
                                .replace(/###\s*[🔴🟡🟢].*?\n/g, '')  // 移除优先级标题
                                .trim();

                            // 添加优先级图标到每个任务后面
                            const contentWithPriorityIcons = contentWithoutPriorityHeaders
                                .replace(
                                    /^-\s*\[([ x])\]\s*(#task\/\w+)\s+(.+?)$/gm,
                                    (match, checkbox, tag, content) => {
                                        // 根据任务内容判断优先级
                                        let priorityIcon = '';
                                        if (match.includes('#task/work')) {
                                            priorityIcon = ' 🔴'; // 工作任务高优先级
                                        } else if (match.includes('#task/learn')) {
                                            priorityIcon = ' 🟡'; // 学习任务中优先级
                                        } else {
                                            priorityIcon = ' 🟢'; // 其他任务低优先级
                                        }
                                        return `- [${checkbox}] ${tag} ${content}${priorityIcon}`;
                                    }
                                );

                            const todoContainer = todoSection.createDiv();
                            await MarkdownRenderer.renderMarkdown(
                                contentWithPriorityIcons,
                                todoContainer,
                                file.path,
                                this
                            );

                            // 使用新的任务点击处理器
                            this.setupTaskClickHandler(todoContainer, file);
                        }
                        else if (sectionContent.startsWith('📝 memo')) {
                            await MarkdownRenderer.renderMarkdown(
                                contentWithoutTitle,
                                memoSection.createDiv(),
                                file.path,
                                this
                            );
                        }
                    }
                } catch (error) {
                    console.error(`处理文件 ${file.path} 时出错:`, error);
                }
            }
        } catch (error) {
            console.error('更新日期内容时出错:', error);
            // 确保即使出错也能显示基本结构
            contentEl.empty();
            contentEl.createEl('div', {
                cls: 'error-state',
                text: '加载内容时出错，请重试'
            });
        }
    }

    private parseContent(content: string): {
        timeline: string | null;
        todos: TodoItem[];
        memos: MemoItem[];
    } {
        const sections = content.split(/^## /m);
        let timeline: string | null = null;
        const todos: TodoItem[] = [];
        const memos: MemoItem[] = [];

        console.log("解析的部分数量:", sections.length);
        console.log("原始内容:", content);

        sections.forEach((section, index) => {
            console.log(`处理第 ${index} 个部分:`, section.substring(0, 100));

            // 处理时间轨迹
            if (section.trim().startsWith('⏳ 时间轨迹')) {
                console.log("发现时间轨迹部分");
                const match = section.match(/```mermaid([\s\S]*?)```/);
                if (match) {
                    timeline = match[1].trim();
                    console.log("提取到时间轨迹:", timeline);
                }
            }
            // 处理待办事项
            else if (section.trim().startsWith('🎯 每日任务')) {
                console.log("发现待办事项部分");
                const lines = section.split('\n');
                let currentPriority = '';

                lines.forEach(line => {
                    const trimmedLine = line.trim();
                    // 检查优先级标题
                    if (trimmedLine.includes('🔴')) currentPriority = 'A';
                    else if (trimmedLine.includes('🟡')) currentPriority = 'B';
                    else if (trimmedLine.includes('🟢')) currentPriority = 'C';

                    // 检查待办项 - 修改正则表达式以匹配您的格式
                    const todoMatch = trimmedLine.match(/^-\s*\[([ x])\]\s*(#task\/\w+)\s+(.+)$/);
                    if (todoMatch) {
                        todos.push({
                            completed: todoMatch[1] === 'x',
                            category: todoMatch[2].replace('#task/', ''), // 移除 #task/ 前缀
                            content: todoMatch[3].trim(),
                            priority: currentPriority
                        });
                        console.log("添加待办事项:", {
                            content: todoMatch[3].trim(),
                            priority: currentPriority,
                            category: todoMatch[2],
                            completed: todoMatch[1] === 'x'
                        });
                    }
                });
            }
            // 处理 Memo
            else if (section.trim().startsWith('📝 memo')) {
                console.log("发现 Memo 部分");
                const lines = section.split('\n');
                
                lines.forEach(line => {
                    // 匹配 "- HH:MM" 格式
                    const memoMatch = line.match(/^-\s+(\d{2}:\d{2})\s+(.*)/);
                    if (memoMatch) {
                        const [_, time, content] = memoMatch;
                        // 提取标签
                        const tags = content.match(/#[\w/]+/g) || [];
                        const cleanContent = content.replace(/#[\w/]+/g, '').trim();
                        
                        memos.push({
                            time,
                            content: cleanContent,
                            tags
                        });
                        console.log("添加 Memo:", time, cleanContent);
                    }
                });
            }
        });

        console.log("解析结果:", { timeline, todos: todos.length, memos: memos.length });
        return { timeline, todos, memos };
    }

    async onClose() {
        // 清理工作
    }

    private getDateString(date: Date): string {
        // 使用 UTC 时间来避免时区问题
        return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
            .toISOString()
            .split('T')[0];
    }

    private formatChineseDate(date: Date): string {
        return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`;
    }

    private async updateTaskState(file: TFile, taskText: string, newState: boolean) {
        try {
            // 获取文件内容
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            let targetLine = -1;

            // 清理任务文本，移除所有 emoji 和标签
            const cleanTaskText = taskText
                .replace(/[\u{1F534}\u{1F7E1}\u{1F7E2}]/gu, '') // 移除优先级 emoji
                .replace(/#[\w/]+/g, '') // 移除标签
                .trim();

            console.log('清理后的任务文本:', cleanTaskText);

            // 找到匹配的任务行
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // 清理行文本用于比较
                const cleanLine = line
                    .replace(/[\u{1F534}\u{1F7E1}\u{1F7E2}]/gu, '')
                    .replace(/#[\w/]+/g, '')
                    .trim();

                console.log('当前行:', line);
                console.log('清理后的行:', cleanLine);

                // 检查是否是任务行并且包含目标文本
                if (line.match(/^-\s*\[[ x]\]/) && cleanLine.includes(cleanTaskText)) {
                    targetLine = i;
                    console.log('找到匹配行:', i, line);
                    break;
                }
            }

            if (targetLine === -1) {
                throw new Error('找不到对应的任务');
            }

            // 更新任务状态
            const line = lines[targetLine];
            // 修改正则表达式以匹配可能的空格变化
            const newLine = line.replace(
                /^(-\s*\[)([ x])(\].*)$/,
                (match, prefix, currentState, suffix) => {
                    console.log('匹配组:', { prefix, currentState, suffix });
                    return `${prefix}${newState ? 'x' : ' '}${suffix}`;
                }
            );

            if (line === newLine) {
                console.error('原始行:', line);
                console.error('新行:', newLine);
                console.error('当前状态:', newState);
                throw new Error('任务状态更新失败：无法更新复选框状态');
            }

            // 更新文件内容
            lines[targetLine] = newLine;
            const newContent = lines.join('\n');

            // 保存更改
            await this.app.vault.modify(file, newContent);
            new Notice('任务状态已更新');
            return true;

        } catch (error) {
            console.error('更新任务状态时出错:', error);
            new Notice(`更新任务状态失败: ${error.message}`);
            return false;
        }
    }

    // 修改任务点击事件处理
    private setupTaskClickHandler(todoContainer: HTMLElement, file: TFile) {
        todoContainer.querySelectorAll('.task-list-item-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const taskItem = (e.target as HTMLElement).closest('.task-list-item');
                if (!taskItem) return;

                const checkbox = e.target as HTMLInputElement;
                const taskText = taskItem.textContent?.trim();
                if (!taskText) return;

                try {
                    // 修改这里：使用 checkbox.checked 而不是其反值
                    const newState = checkbox.checked;
                    console.log('设置新状态为:', newState);
                    
                    const success = await this.updateTaskState(file, taskText, newState);
                    
                    if (success) {
                        // 不需要再次切换 checkbox，因为浏览器已经切换了
                        taskItem.classList.toggle('is-checked', newState);
                        
                        // 立即刷新视图
                        await this.updateDailyContent(this.currentDate);
                    } else {
                        // 如果更新失败，恢复复选框状态
                        checkbox.checked = !newState;
                    }
                } catch (error) {
                    console.error('处理任务状态更新失败:', error);
                    new Notice('更新任务状态失败');
                    // 恢复复选框状态
                    checkbox.checked = !checkbox.checked;
                }
            });
        });
    }

    // 添加标签缓存方法
    private async updateTagCache() {
        const now = Date.now();
        if (now - this.lastCacheUpdate < this.CACHE_DURATION) {
            return;
        }

        this.tagCache.clear();
        const files = this.getDailyFiles();

        for (const file of files) {
            try {
                const content = await this.app.vault.cachedRead(file);
                const tags = content.match(/#[\w/]+/g) || [];
                
                tags.forEach(tag => {
                    if (!this.tagCache.has(tag)) {
                        this.tagCache.set(tag, {
                            tag,
                            count: 1,
                            files: new Set([file.path])
                        });
                    } else {
                        const tagInfo = this.tagCache.get(tag)!;
                        tagInfo.count++;
                        tagInfo.files.add(file.path);
                    }
                });
            } catch (error) {
                console.error(`处理文件 ${file.path} 的标签时出错:`, error);
            }
        }

        this.lastCacheUpdate = now;
        this.renderTagCloud();
    }

    private buildTagTree(tags: Map<string, TagInfo>): TagNode {
        const root: TagNode = {
            name: 'root',
            fullPath: '',
            count: 0,
            files: new Set(),
            children: new Map()
        };

        // 遍历所有标签构建树结构
        for (const [tagPath, info] of tags) {
            const parts = tagPath.substring(1).split('/'); // 移除开头的 # 并分割
            let current = root;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const currentPath = '#' + parts.slice(0, i + 1).join('/');
                
                if (!current.children.has(part)) {
                    current.children.set(part, {
                        name: part,
                        fullPath: currentPath,
                        count: 0,
                        files: new Set(),
                        children: new Map()
                    });
                }
                
                const node = current.children.get(part)!;
                node.count += info.count;
                info.files.forEach(file => node.files.add(file));
                current = node;
            }
        }

        return root;
    }

    private renderTagNode(node: TagNode, container: HTMLElement, level: number = 0) {
        if (level > 0) {
            const tagEl = container.createEl('div', {
                cls: `tag-item level-${level}`,
            });
            
            if (node.children.size > 0) {
                tagEl.createEl('span', {
                    cls: 'tag-toggle'
                }).addEventListener('click', (e) => {
                    e.stopPropagation();
                    const childContainer = tagEl.nextElementSibling;
                    if (childContainer) {
                        childContainer.toggleClass('hidden');
                    }
                });
            }

            const labelEl = tagEl.createEl('span', {
                text: node.name,
                cls: 'tag-label'
            });

            tagEl.createEl('span', {
                text: `(${node.count})`,
                cls: 'tag-count'
            });

            tagEl.addEventListener('click', () => {
                this.showTaggedFiles({
                    tag: node.fullPath,
                    count: node.count,
                    files: node.files
                });
            });
        }

        if (node.children.size > 0) {
            const childContainer = container.createEl('div', {
                cls: `tag-children ${level > 0 ? 'hidden' : ''}`
            });
            
            const sortedChildren = Array.from(node.children.values())
                .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

            for (const child of sortedChildren) {
                this.renderTagNode(child, childContainer, level + 1);
            }
        }
    }

    private renderTagCloud() {
        let tagCloudEl = this.calendar.querySelector('.tag-cloud');
        if (!tagCloudEl) {
            tagCloudEl = this.calendar.createDiv({ cls: 'tag-cloud' });
        }
        tagCloudEl.empty();

        tagCloudEl.createEl('h3', { text: '标签云' });
        const tagContainer = tagCloudEl.createDiv({ cls: 'tag-container' });

        // 构建并渲染标签树
        const tagTree = this.buildTagTree(this.tagCache);
        this.renderTagNode(tagTree, tagContainer);
    }

    // 显示包含特定标签的文件
    private showTaggedFiles(tagInfo: TagInfo) {
        const modal = new TaggedFilesModal(this.app, tagInfo);
        modal.open();
    }

    // 定期更新标签缓存
    private startTagCacheUpdateInterval() {
        setInterval(() => {
            if (!this.app.workspace.activeLeaf) return;
            this.updateTagCache();
        }, this.CACHE_DURATION);
    }

    private getDailyFiles(): TFile[] {
        return this.app.vault.getMarkdownFiles()
            .filter(file => file.path.startsWith(this.DAILY_PATH));
    }

    async onload() {
        // 添加日历图标到文件页面
        this.addRibbonIcon('calendar', '打开日历视图', () => {
            this.activateView();
        });
    }

    // 激活日历视图
    async activateView() {
        const { workspace } = this.app;
        
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0];
        
        if (!leaf) {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({
                type: VIEW_TYPE_CALENDAR,
                active: true,
            });
        }
        
        workspace.revealLeaf(leaf);
    }
}

class TaggedFilesModal extends Modal {
    private currentPage = 0;
    private readonly pageSize = 10;
    private loading = false;
    private hasMore = true;
    private container: HTMLElement;
    private observer: IntersectionObserver;

    constructor(app: App, private tagInfo: TagInfo) {
        super(app);
        this.containerEl.addClass('tagged-files-modal-container');
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // 创建标题栏
        const headerEl = contentEl.createDiv({ cls: 'tagged-files-modal-header' });
        
        // 标题
        headerEl.createEl('h2', { 
            text: `#${this.tagInfo.tag}`,
            cls: 'tagged-files-header' 
        });

        // 关闭按钮
        const closeButton = headerEl.createEl('button', {
            cls: 'modal-close-button'
        });
        closeButton.addEventListener('click', () => this.close());

        // 创建内容容器
        this.container = contentEl.createDiv({ cls: 'tagged-files-container' });

        try {
            // 创建加载指示器
            const loadingIndicator = contentEl.createDiv({ 
                cls: 'loading-indicator',
                text: '加载中...' 
            });

            await this.loadMoreItems();
            loadingIndicator.addClass('hidden');

            // 创建观察目标
            const observerTarget = contentEl.createDiv({ cls: 'observer-target' });
            
            // 设置无限滚动
            this.observer = new IntersectionObserver(async (entries) => {
                const target = entries[0];
                if (target.isIntersecting && !this.loading && this.hasMore) {
                    loadingIndicator.removeClass('hidden');
                    await this.loadMoreItems();
                    loadingIndicator.addClass('hidden');
                }
            });
            
            this.observer.observe(observerTarget);
        } catch (error) {
            console.error('初始化模态窗口失败:', error);
            const errorEl = contentEl.createDiv({ 
                cls: 'error-state',
                text: '加载内容失败，请重试' 
            });
        }
    }

    private async loadMoreItems() {
        if (this.loading || !this.hasMore) return;

        this.loading = true;
        const files = Array.from(this.tagInfo.files).sort((a, b) => {
            const fileA = this.app.vault.getAbstractFileByPath(a);
            const fileB = this.app.vault.getAbstractFileByPath(b);
            if (fileA instanceof TFile && fileB instanceof TFile) {
                return fileB.stat.ctime - fileA.stat.ctime; // 按修改时间降序排序
            }
            return 0;
        });

        const start = this.currentPage * this.pageSize;
        const items = files.slice(start, start + this.pageSize);

        if (items.length === 0) {
            this.hasMore = false;
            this.loading = false;
            return;
        }

        for (const filePath of items) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) continue;

            try {
                const content = await this.app.vault.read(file);
                const card = this.createNoteCard(file, content);
                this.container.appendChild(card);
            } catch (error) {
                console.error(`Error loading file ${filePath}:`, error);
            }
        }

        this.currentPage++;
        this.loading = false;
        this.hasMore = files.length > (this.currentPage * this.pageSize);
    }

    private createNoteCard(file: TFile, content: string): HTMLElement {
        const card = createEl('div', { cls: 'note-card' });

        // 创建卡片头部
        const header = card.createDiv({ cls: 'note-card-header' });
        
        // 文件名和日期
        const titleEl = header.createDiv({ cls: 'note-card-title' });
        titleEl.createSpan({ text: file.basename });
        // titleEl.createSpan({ 
        //     text: file.stat.mtime ? new Date(file.stat.mtime).toLocaleDateString('zh-CN') : '',
        //     cls: 'note-card-date' 
        // });

        // 创建卡片内容
        const contentEl = card.createDiv({ cls: 'note-card-content' });
        
        // 使用 Obsidian 的 Markdown 渲染
        MarkdownRenderer.renderMarkdown(
            this.getPreviewContent(content),
            contentEl,
            file.path,
            this
        );

        // 添加点击事件
        card.addEventListener('click', async () => {
            await this.app.workspace.getLeaf(false).openFile(file);
            this.close();
        });

        return card;
    }

    private getPreviewContent(content: string): string {
        // 提取前 200 个字符作为预览，确保不会截断 Markdown 语法
        const previewLength = 200;
        let preview = content.slice(0, previewLength);
        
        // 如果内容被截断，添加省略号
        if (content.length > previewLength) {
            preview += '...';
        }
        
        return preview;
    }

    onClose() {
        this.observer.disconnect();
        const { contentEl } = this;
        contentEl.empty();
    }
} 