use crate::ai::client::ChatMessage;
use crate::models::{ProjectProfile, StyleConfig};
use crate::resources;

/// 章节任务单：用于精细化控制正文生成方向
pub struct ChapterTaskSheet {
    pub goal: String,
    pub conflict_level: i64,
    pub hook: String,
    pub payoff: String,
    pub must_avoid: String,
    pub target_word_count: i64,
}

impl ChapterTaskSheet {
    /// 格式化为注入到上下文的文本块
    pub fn format_section(&self) -> String {
        let mut parts: Vec<String> = Vec::new();

        if !self.goal.trim().is_empty() {
            parts.push(format!("- 本章目标：{}", self.goal.trim()));
        }
        if self.conflict_level > 0 {
            let level_desc = match self.conflict_level {
                1 => "低冲突",
                2 => "较低冲突",
                3 => "中等冲突",
                4 => "较高冲突",
                5 => "高冲突",
                _ => "中等冲突",
            };
            parts.push(format!("- 冲突等级：{}（{}级）", level_desc, self.conflict_level));
        }
        if !self.hook.trim().is_empty() {
            parts.push(format!("- 本章钩子：{}", self.hook.trim()));
        }
        if !self.payoff.trim().is_empty() {
            parts.push(format!("- 本章伏笔回收：{}", self.payoff.trim()));
        }
        if !self.must_avoid.trim().is_empty() {
            parts.push(format!("- 禁止事项：{}", self.must_avoid.trim()));
        }
        if self.target_word_count > 0 {
            parts.push(format!("- 目标字数：{}", self.target_word_count));
        }

        if parts.is_empty() {
            String::new()
        } else {
            format!("## 章节任务单\n\n{}\n\n", parts.join("\n"))
        }
    }
}

pub struct ContextBuilder {
    stopwords: Vec<String>,
}

impl ContextBuilder {
    pub fn new() -> Self {
        Self {
            stopwords: resources::load_stopwords(),
        }
    }

    /// 构建项目设定文本块（注入到各阶段上下文）
    fn format_profile_section(&self, profile: Option<&ProjectProfile>) -> String {
        match profile {
            Some(p) if !p.genre.is_empty() || !p.selling_point.is_empty() => {
                format!(
                    "## 项目设定\n\n\
                    - 题材：{}\n\
                    - 卖点：{}\n\
                    - 目标读者：{}\n\
                    - 前 30 章承诺：{}\n\
                    - 叙事视角：{}\n\
                    - 节奏偏好：{}\n\
                    - 默认章节字数：{}\n\
                    - 预计章节数：{}\n\n",
                    p.genre,
                    p.selling_point,
                    p.target_audience,
                    p.reader_promise,
                    p.narrative_pov,
                    p.pace_preference,
                    p.default_chapter_length,
                    p.estimated_chapter_count,
                )
            }
            _ => String::new(),
        }
    }

    /// 构建大纲生成上下文
    /// existing_content: 大纲中已有的内容，为空时生成全新大纲，非空时在其基础上扩展
    pub fn build_outline_context(&self, project_name: &str, existing_content: &str, profile: Option<&ProjectProfile>) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        let profile_section = self.format_profile_section(profile);

        let user_content = if existing_content.trim().is_empty() {
            format!(
                "请为小说《{}》生成一份完整的大纲。\n\n\
                {}\
                ## 大纲模板\n\n{}\n\n\
                ## 大纲示例\n\n{}\n\n\
                请先在 <thinking> 标签内简要构思核心冲突、人物方向和情节走向，\
                然后在 </thinking> 之后严格按照模板格式输出完整大纲。\
                确保核心冲突明确、人物方向清晰、情节主线有起承转合。\
                必须输出模板中的所有章节，不可中途截断。\
                避免使用AI味高频词。",
                project_name,
                profile_section,
                resources::OUTLINE_TEMPLATE,
                resources::OUTLINE_EXAMPLE,
            )
        } else {
            format!(
                "小说《{}》的大纲已有以下内容，请在其基础上扩展和完善，保留原有内容并补充缺失部分：\n\n\
                {}\
                ## 已有大纲\n\n{}\n\n\
                ## 大纲模板\n\n{}\n\n\
                请先在 <thinking> 标签内分析已有大纲的完整度和缺失部分，\
                然后在 </thinking> 之后按模板格式输出完整大纲（保留已有内容+补充缺失部分）。\
                必须输出完整大纲，不可中途截断。\
                确保新增内容与已有内容风格一致、逻辑连贯。\
                避免使用AI味高频词。",
                project_name,
                profile_section,
                existing_content,
                resources::OUTLINE_TEMPLATE,
            )
        };

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说创作顾问。请严格按照方法论指导，帮助用户构建小说大纲。\n\n\
                    ## 创作方法论\n\n{}\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking>...</thinking> 中进行构思和分析，\
                    然后在 </thinking> 之后输出正式内容。\
                    正式内容必须完整，不可中途截断。",
                    resources::METHODOLOGY,
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_content,
            },
        ]
    }

    /// 构建人物生成上下文（注入大纲内容）
    /// 输出要求：JSON 格式，便于后端直接解析入库
    pub fn build_characters_context(&self, outline: &str, profile: Option<&ProjectProfile>) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();
        let profile_section = self.format_profile_section(profile);

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说创作顾问。请根据大纲内容，帮助用户创建详细的人物小传。\n\n\
                    ## 创作方法论\n\n{}\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内分析大纲中的角色需求和关系网络，\
                    然后在 </thinking> 之后严格按照 JSON 格式输出人物。\
                    不要输出 Markdown，不要使用代码块包裹，不要添加任何解释说明。\
                    必须输出完整的人物列表，不可中途截断。",
                    resources::METHODOLOGY,
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请根据以下大纲，为小说创建完整的人物小传。\n\n\
                    {}\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物示例（参考质量，但你的输出必须是 JSON）\n\n{}\n\n\
                    请先在 <thinking> 标签内构思角色需求和关系，\
                    然后在 </thinking> 之后严格按照以下 JSON 格式输出人物：\n\n\
                    {{\n  \
                      \"characters\": [\n    \
                        {{\n      \
                          \"name\": \"角色名\",\n      \
                          \"tier\": \"main\",\n      \
                          \"identity\": \"身份描述\",\n      \
                          \"appearance\": \"外貌描写\",\n      \
                          \"personality\": \"性格特质\",\n      \
                          \"motivation\": \"内在驱动力\",\n      \
                          \"relationships\": \"人物关系\",\n      \
                          \"key_events\": \"关键事件\"\n    \
                    }}\n  \
                    ],\n  \
                      \"relations\": [\n    \
                        {{\n      \
                          \"source_name\": \"角色A名\",\n      \
                          \"target_name\": \"角色B名\",\n      \
                          \"relation_type\": \"关系类型（如：师徒、仇敌、恋人、兄弟）\",\n      \
                          \"tension\": \"紧张程度（如：高/中/低，可留空）\",\n      \
                          \"summary\": \"关系简要描述\"\n    \
                        }}\n  \
                    ]\n\
                    }}\n\n\
                    字段要求：\n\
                    - tier 只能是 \"main\"（主角）、\"supporting\"（重要配角）、\"minor\"（其他角色）\n\
                    - 每个字段必须是字符串，不可省略\n\
                    - characters 至少包含 3 个角色\n\
                    - 人物关系要能推动情节发展\n\
                    - 每个角色都需要清晰的动机和性格多面性\n\
                    - relations 数组必须列出主要角色之间的关键关系，source_name 和 target_name 必须与 characters 中的 name 一致\n\
                    - relations 至少包含 2 条关系\n\n\
                    必须输出完整 JSON，不可中途截断。",
                    profile_section,
                    outline,
                    resources::CHARACTERS_EXAMPLE,
                ),
            },
        ]
    }

    /// 构建章节目录生成上下文（注入大纲+人物）
    /// 输出要求：JSON 格式，便于后端直接解析入库
    pub fn build_chapters_context(&self, outline: &str, characters_summary: &str, profile: Option<&ProjectProfile>) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();
        let profile_section = self.format_profile_section(profile);

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说创作顾问。请根据大纲和人物信息，帮助用户设计章节目录。\n\n\
                    ## 创作方法论\n\n{}\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内规划章节节奏和关键转折点，\
                    然后在 </thinking> 之后严格按照 JSON 格式输出章节目录。\
                    不要输出 Markdown，不要使用代码块包裹，不要添加任何解释说明。\
                    必须输出完整的章节列表，不可中途截断。",
                    resources::METHODOLOGY,
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请根据以下大纲和人物信息，为小说设计章节目录。\n\n\
                    {}\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物信息\n\n{}\n\n\
                    请先在 <thinking> 标签内规划节奏和转折，\
                    然后在 </thinking> 之后严格按照以下 JSON 格式输出章节：\n\n\
                    {{\n  \
                      \"chapters\": [\n    \
                        {{\n      \
                          \"chapter_number\": 1,\n      \
                          \"title\": \"章节标题\",\n      \
                          \"summary\": \"章节摘要（50-100字）\",\n      \
                          \"goal\": \"本章目标（本章要完成什么）\",\n      \
                          \"conflict_level\": 3,\n      \
                          \"hook\": \"开篇钩子（用什么抓住读者）\",\n      \
                          \"payoff\": \"收束回报（章末给读者什么满足感）\",\n      \
                          \"must_avoid\": \"禁止事项（本章必须避免的）\",\n      \
                          \"target_word_count\": 3000\n    \
                        }}\n  \
                      ]\n\
                    }}\n\n\
                    字段要求：\n\
                    - chapter_number 是整数，从 1 开始递增\n\
                    - title 是简洁有力的章节标题，暗示本章核心\n\
                    - summary 是 50-100 字的章节摘要，概述主要事件和推进\n\
                    - goal 是本章要达成的叙事目标（如：主角发现关键线索）\n\
                    - conflict_level 是 1-5 的整数，1=舒缓过渡，5=高潮转折\n\
                    - hook 是开篇吸引读者的手法（如：以悬念开场）\n\
                    - payoff 是章末给读者的满足感（如：揭示部分真相）\n\
                    - must_avoid 是本章写作中必须避免的内容（如：不要让配角抢戏），可留空\n\
                    - target_word_count 是目标字数，默认 3000\n\
                    - chapters 至少包含 5 章\n\
                    - 确保情节推进有节奏感，紧张与缓和交替，每章结尾有悬念或推动力\n\n\
                    必须输出完整 JSON，不可中途截断。",
                    profile_section,
                    outline,
                    characters_summary,
                ),
            },
        ]
    }

    /// 构建正文生成上下文（注入大纲+人物+章节任务单+风格+模板+资产）
    pub fn build_content_context(
        &self,
        outline: &str,
        characters_summary: &str,
        chapter_title: &str,
        chapter_summary: &str,
        style_config: Option<&StyleConfig>,
        previous_content: &str,
        adjacent_chapters_context: &str,
        profile: Option<&ProjectProfile>,
        task_sheet: Option<&ChapterTaskSheet>,
        assets_section: &str,
    ) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        let task_sheet_section = match task_sheet {
            Some(ts) => ts.format_section(),
            None => String::new(),
        };

        let style_section = match style_config {
            Some(sc) => format!(
                "## 风格配置\n\n\
                - 叙事视角：{}\n\
                - 正式程度：{}\n\
                - 情感强度：{}\n\
                - 参考文本风格：{}\n\
                - 自定义禁用词：{}\n",
                sc.narrative_voice,
                sc.formality,
                sc.emotion_intensity,
                if sc.reference_text.is_empty() { "无".to_string() } else { sc.reference_text.clone() },
                if sc.custom_stopwords == "[]" { "无".to_string() } else { sc.custom_stopwords.clone() },
            ),
            None => "## 风格配置\n\n使用默认风格。".to_string(),
        };

        let profile_section = self.format_profile_section(profile);

        let previous_section = if previous_content.is_empty() {
            // keep this comment to avoid duplicate match with polish_content_context
            String::new()
        } else {
            format!(
                "## 上一章正文（供衔接参考）\n\n{}\n\n",
                previous_content,
            )
        };

        let adjacent_context = adjacent_chapters_context.trim();
        let adjacent_section = if adjacent_context.is_empty() {
            String::new()
        } else if adjacent_context.starts_with("## 相邻章节衔接") {
            format!("{}\n\n", adjacent_context)
        } else {
            format!("## 相邻章节衔接\n\n{}\n\n", adjacent_context)
        };

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说作家。请根据提供的大纲、人物和章节信息，撰写小说正文。\n\n\
                    ## 创作方法论\n\n{}\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内构思场景布局和对话走向，\
                    然后在 </thinking> 之后输出正式正文。\
                    正文必须完整，写到章节结尾，不可中途截断。\
                    每章必须和相邻章节形成连续阅读体验，避免重复已完成情节。",
                    resources::METHODOLOGY,
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请撰写以下章节的正文。\n\n\
                    {}\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物信息\n\n{}\n\n\
                    {}\
                    {}\
                    {}\
                    {}\
                    {}\n\n\
                    ## 当前章节\n\n\
                    标题：{}\n\
                    摘要：{}\n\n\
                    ## 正文写作模板\n\n{}\n\n\
                    请先在 <thinking> 标签内构思场景和对话走向，\
                    然后在 </thinking> 之后严格按照大纲和章节摘要的方向写作，保持人物语言风格一致。\
                    必须承接上一章的状态、情绪和未完成线索，铺垫下一章需要进入的事件，避免重复上一章或下一章已经承担的内容。\
                    如果任务单中指定了目标字数，请尽量接近该字数。\
                    如果任务单中有禁止事项，严格遵守不可触碰。\
                    以场景为单位推进，对话与叙述交替，节奏自然。\
                    章节结尾设置悬念或情感高潮。\
                    必须写到章节结尾，不可中途截断。\
                    绝对不要使用AI味高频词。",
                    profile_section,
                    outline,
                    characters_summary,
                    task_sheet_section,
                    previous_section,
                    adjacent_section,
                    style_section,
                    assets_section,
                    chapter_title,
                    chapter_summary,
                    resources::CONTENT_TEMPLATE,
                ),
            },
        ]
    }

    /// 构建单个人物生成上下文（根据用户描述）
    /// 输出要求：JSON 格式，便于后端直接解析入库
    pub fn build_character_from_description_context(&self, outline: &str, description: &str, tier: &str) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();
        let tier_cn = match tier {
            "main" => "主要角色（主角）",
            "supporting" => "重要配角",
            "minor" => "其他角色",
            _ => "角色",
        };

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说创作顾问。请根据用户描述和大纲内容，创建一个详细的人物小传。\n\n\
                    ## 创作方法论\n\n{}\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内构思角色的核心特质和关系，\
                    然后在 </thinking> 之后严格按照 JSON 格式输出人物。\
                    不要输出 Markdown，不要使用代码块包裹，不要添加任何解释说明。",
                    resources::METHODOLOGY,
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请根据以下大纲和用户描述，创建一个{}。\n\n\
                    ## 小说大纲\n\n{}\n\n\
                    ## 用户描述\n\n{}\n\n\
                    请先在 <thinking> 标签内构思角色，\
                    然后在 </thinking> 之后严格按照以下 JSON 格式输出：\n\n\
                    {{\n  \
                      \"name\": \"角色名\",\n  \
                      \"tier\": \"{}\",\n  \
                      \"identity\": \"身份描述\",\n  \
                      \"appearance\": \"外貌描写\",\n  \
                      \"personality\": \"性格特质\",\n  \
                      \"motivation\": \"内在驱动力\",\n  \
                      \"relationships\": \"人物关系\",\n  \
                      \"key_events\": \"关键事件\"\n\
                    }}\n\n\
                    每个字段必须是字符串，不可省略。\
                    人物要与大纲中的情节和其他角色有合理的联系。",
                    tier_cn,
                    outline,
                    description,
                    tier,
                ),
            },
        ]
    }

    /// 构建正文润色上下文
    pub fn build_polish_content_context(
        &self,
        outline: &str,
        characters_summary: &str,
        chapter_title: &str,
        chapter_summary: &str,
        original_content: &str,
        style_config: Option<&StyleConfig>,
        style_rules_section: &str,
    ) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        let style_section = match style_config {
            Some(sc) => format!(
                "## 风格配置\n\n\
                - 叙事视角：{}\n\
                - 正式程度：{}\n\
                - 情感强度：{}\n",
                sc.narrative_voice,
                sc.formality,
                sc.emotion_intensity,
            ),
            None => "## 风格配置\n\n使用默认风格。".to_string(),
        };

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说润色编辑。你的任务是改进已有正文的文学质量，\
                    而不是重写。保留原文的核心情节、对话和叙事结构，只做以下改进：\n\n\
                    1. 优化句式节奏，减少冗余表达\n\
                    2. 增强场景描写的画面感\n\
                    3. 让对话更自然、更有性格特征\n\
                    4. 消除AI味用词\n\
                    5. 适度增加细节但不拖沓\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内分析原文的优缺点和改进方向，\
                    然后在 </thinking> 之后输出润色后的完整正文。\
                    必须输出完整润色后正文，不可中途截断。",
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请润色以下章节正文。\n\n\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物信息\n\n{}\n\n\
                    {}\
                    {}\n\n\
                    ## 当前章节\n\n\
                    标题：{}\n\
                    摘要：{}\n\n\
                    ## 原文正文\n\n{}\n\n\
                    请先在 <thinking> 标签内分析原文的优缺点，\
                    然后在 </thinking> 之后输出润色后的完整正文。\
                    保留原文的核心情节和对话，只做文学质量上的改进。\
                    如果提供了写法规则，润色时需遵守这些规则。\
                    必须输出完整正文，不可中途截断。",
                    outline,
                    characters_summary,
                    style_section,
                    style_rules_section,
                    chapter_title,
                    chapter_summary,
                    original_content,
                ),
            },
        ]
    }

    /// 构建章节目录润色上下文
    pub fn build_polish_chapter_context(&self, outline: &str, characters_summary: &str, original_chapters: &str) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说编辑。你的任务是改进已有章节目录的质量，\
                    而不是重新生成。保留原有章节数量和核心情节走向，只做以下改进：\n\n\
                    1. 让标题更有文学感和暗示性\n\
                    2. 让摘要更精准、更有推动力\n\
                    3. 消除AI味用词\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内分析原目录的优缺点，\
                    然后在 </thinking> 之后严格按照 JSON 格式输出润色后的章节。\
                    不要输出 Markdown，不要使用代码块包裹。",
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请润色以下章节目录。\n\n\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物信息\n\n{}\n\n\
                    ## 原章节目录\n\n{}\n\n\
                    请先在 <thinking> 标签内分析原目录的优缺点，\
                    然后在 </thinking> 之后严格按照 JSON 格式输出润色后的章节：\n\n\
                    {{\n  \
                      \"chapters\": [\n    \
                        {{\n      \
                          \"chapter_number\": 1,\n      \
                          \"title\": \"润色后的标题\",\n      \
                          \"summary\": \"润色后的摘要\"\n    \
                        }}\n  \
                      ]\n\
                    }}\n\n\
                    章节数量必须与原目录一致，chapter_number 保持不变，只润色 title 和 summary。",
                    outline,
                    characters_summary,
                    original_chapters,
                ),
            },
        ]
    }

    /// 构建方向候选生成上下文（一句话灵感 -> 多方向候选）
    /// 输出要求：JSON 格式，返回 3 个方向候选
    pub fn build_idea_directions_context(&self, idea: &str) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位资深的网文策划编辑。用户会给你一句话灵感，\
                    你需要基于这个灵感生成 3 个不同方向的故事开发方向。\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内分析灵感的可行性和潜在方向，\
                    然后在 </thinking> 之后严格按照 JSON 格式输出 3 个方向。\
                    不要输出 Markdown，不要使用代码块包裹，不要添加任何解释说明。",
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请根据以下一句话灵感，生成 3 个不同方向的故事开发方向。\n\n\
                    ## 灵感\n\n{}\n\n\
                    请先在 <thinking> 标签内分析灵感的可行性和不同方向，\
                    然后在 </thinking> 之后严格按照以下 JSON 格式输出：\n\n\
                    {{\n  \
                      \"directions\": [\n    \
                        {{\n      \
                          \"title\": \"方向名称（5-15字）\",\n      \
                          \"genre\": \"题材类型\",\n      \
                          \"selling_point\": \"核心卖点（一句话说明为什么读者会追）\",\n      \
                          \"target_audience\": \"目标读者画像\",\n      \
                          \"core_conflict\": \"核心冲突（主角 vs 对立面）\",\n      \
                          \"reader_promise\": \"前 30 章承诺给读者的体验\"\n    \
                        }}\n  \
                      ]\n\
                    }}\n\n\
                    要求：\n\
                    - 必须输出 3 个方向，每个方向有明确的差异\n\
                    - title 要简洁有力，能立刻抓住作者\n\
                    - selling_point 要说明这个方向的商业价值\n\
                    - core_conflict 要具体到主角和对立面的矛盾\n\
                    - reader_promise 要说明前期读者的爽点或期待\n\
                    - 每个字段必须是字符串，不可省略",
                    idea,
                ),
            },
        ]
    }

    /// 构建初始大纲生成上下文（根据选定方向 -> 初始大纲）
    pub fn build_outline_from_direction_context(&self, direction_json: &str) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说创作顾问。用户选定了一个故事方向，\
                    请根据这个方向生成一份完整的初始大纲。\n\n\
                    ## 创作方法论\n\n{}\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内构思核心冲突、人物方向和情节走向，\
                    然后在 </thinking> 之后严格按照模板格式输出完整大纲。\
                    正式内容必须完整，不可中途截断。",
                    resources::METHODOLOGY,
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请根据以下故事方向，生成一份完整的初始大纲。\n\n\
                    ## 选定方向\n\n{}\n\n\
                    ## 大纲模板\n\n{}\n\n\
                    ## 大纲示例\n\n{}\n\n\
                    请先在 <thinking> 标签内构思核心冲突、人物方向和情节走向，\
                    然后在 </thinking> 之后严格按照模板格式输出完整大纲。\
                    确保核心冲突明确、人物方向清晰、情节主线有起承转合。\
                    必须输出模板中的所有章节，不可中途截断。\
                    避免使用AI味高频词。",
                    direction_json,
                    resources::OUTLINE_TEMPLATE,
                    resources::OUTLINE_EXAMPLE,
                ),
            },
        ]
    }

    /// 构建章节审核上下文（评估正文质量并返回 JSON 格式的审核结果）
    pub fn build_review_context(
        &self,
        outline: &str,
        characters_summary: &str,
        chapter_title: &str,
        chapter_summary: &str,
        content: &str,
        task_sheet: Option<&ChapterTaskSheet>,
        profile: Option<&ProjectProfile>,
        style_rules_section: &str,
    ) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();
        let profile_section = self.format_profile_section(profile);
        let task_sheet_section = match task_sheet {
            Some(ts) => ts.format_section(),
            None => String::new(),
        };

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位严格的小说质量审核编辑。请从连续性、人物一致性、节奏和整体质量四个维度审核章节正文。\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内逐条分析问题，\
                    然后在 </thinking> 之后严格按照 JSON 格式输出审核结果。\
                    不要输出 Markdown，不要使用代码块包裹，不要添加任何解释说明。",
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请审核以下章节正文的质量。\n\n\
                    {}\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物信息\n\n{}\n\n\
                    {}\
                    {}\
                    ## 当前章节\n\n\
                    标题：{}\n\
                    摘要：{}\n\n\
                    ## 章节正文\n\n{}\n\n\
                    请先在 <thinking> 标签内逐条分析以下维度的问题：\n\
                    1. 连续性：与大纲、上一章和章节摘要是否一致\n\
                    2. 人物一致性：角色行为、语言风格是否符合人物设定\n\
                    3. 节奏：是否有拖沓或仓促，场景转换是否自然\n\
                    4. 整体质量：AI味用词、重复表达、逻辑漏洞\n\
                    如果提供了写法规则，检查正文是否遵守这些规则。\n\
                    然后在 </thinking> 之后严格按照以下 JSON 格式输出审核结果：\n\n\
                    {{\n  \
                      \"overall_score\": 0-100,\n  \
                      \"continuity_score\": 0-100,\n  \
                      \"character_score\": 0-100,\n  \
                      \"pacing_score\": 0-100,\n  \
                      \"issues\": [\n    \
                        {{\n      \
                          \"type\": \"continuity|character|pacing|quality\",\n      \
                          \"severity\": \"high|medium|low\",\n      \
                          \"description\": \"问题描述\",\n      \
                          \"location\": \"问题出现的大致位置或引用原文片段\"\n    \
                        }}\n  \
                      ],\n  \
                      \"suggestions\": \"整体修复建议（一段文字）\"\n\
                    }}\n\n\
                    评分标准：90+ 优秀，70-89 良好，50-69 及格，50以下不合格。\n\
                    issues 为空数组表示没有发现问题。\n\
                    必须输出完整 JSON，不可中途截断。",
                    profile_section,
                    outline,
                    characters_summary,
                    task_sheet_section,
                    style_rules_section,
                    chapter_title,
                    chapter_summary,
                    content,
                ),
            },
        ]
    }

    /// 构建章节修复上下文（根据审核问题修复正文）
    pub fn build_repair_context(
        &self,
        outline: &str,
        characters_summary: &str,
        chapter_title: &str,
        chapter_summary: &str,
        original_content: &str,
        issues_json: &str,
        suggestions: &str,
        task_sheet: Option<&ChapterTaskSheet>,
        profile: Option<&ProjectProfile>,
        style_rules_section: &str,
    ) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();
        let profile_section = self.format_profile_section(profile);
        let task_sheet_section = match task_sheet {
            Some(ts) => ts.format_section(),
            None => String::new(),
        };

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说润色编辑。你的任务是根据审核发现的问题修复正文，而不是重写。\n\
                    保留原文的核心情节、对话和叙事结构，只修复审核指出的问题。\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内分析每个问题的修复方案，\
                    然后在 </thinking> 之后输出修复后的完整正文。\
                    必须输出完整正文，不可中途截断。",
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请根据审核结果修复以下章节正文。\n\n\
                    {}\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物信息\n\n{}\n\n\
                    {}\
                    {}\
                    ## 当前章节\n\n\
                    标题：{}\n\
                    摘要：{}\n\n\
                    ## 审核发现的问题\n\n{}\n\n\
                    ## 修复建议\n\n{}\n\n\
                    ## 原文正文\n\n{}\n\n\
                    请先在 <thinking> 标签内分析每个问题的修复方案，\
                    然后在 </thinking> 之后输出修复后的完整正文。\
                    保留原文的核心情节和对话，只修复审核指出的问题。\
                    不要引入新的问题，不要改变章节的核心走向。\
                    如果提供了写法规则，修复时需遵守这些规则。\
                    必须输出完整正文，不可中途截断。",
                    profile_section,
                    outline,
                    characters_summary,
                    task_sheet_section,
                    style_rules_section,
                    chapter_title,
                    chapter_summary,
                    issues_json,
                    suggestions,
                    original_content,
                ),
            },
        ]
    }

    fn format_stopwords_hint(&self) -> String {
        if self.stopwords.is_empty() {
            return "无".to_string();
        }
        format!(
            "以下词汇在写作中严禁使用，它们是典型的AI生成痕迹：\n{}",
            self.stopwords.join("、")
        )
    }

    /// 构建章节后护理上下文（从本章正文提取事实、人物状态、新人物候选、伏笔、下一章衔接）
    pub fn build_aftercare_context(
        &self,
        outline: &str,
        characters_summary: &str,
        chapter_title: &str,
        chapter_summary: &str,
        content: &str,
    ) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        let json_template = r#"{
  "new_facts": [
    {
      "fact_type": "plot|character|world|timeline",
      "content": "事实内容"
    }
  ],
  "character_states": [
    {
      "character_name": "角色名",
      "state_summary": "状态摘要",
      "goal": "当前目标",
      "emotion": "情绪状态",
      "location": "当前位置"
    }
  ],
  "new_characters": [
    {
      "name": "角色名",
      "identity": "身份描述",
      "reason": "为什么需要加入人物表"
    }
  ],
  "foreshadows": [
    {
      "content": "伏笔内容",
      "action": "setup|payoff"
    }
  ],
  "next_chapter_hook": "下一章衔接建议"
}"#;

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说编辑助手。你的任务是从已完成的章节正文中提取关键信息，\n\
                    帮助作者维护故事一致性和连续性。\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内逐条分析本章内容，\n\
                    然后在 </thinking> 之后严格按照 JSON 格式输出提取结果。\n\
                    不要输出 Markdown，不要使用代码块包裹，不要添加任何解释说明。",
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请从以下章节正文中提取关键信息。\n\n\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物信息\n\n{}\n\n\
                    ## 当前章节\n\n\
                    标题：{}\n\
                    摘要：{}\n\n\
                    ## 章节正文\n\n{}\n\n\
                    请先在 <thinking> 标签内逐条分析本章内容，然后提取以下信息：\n\n\
                    1. 新增事实：本章中确立的、需要在后续章节保持一致的事实\n\
                    2. 人物状态变化：本章结束时各角色的最新状态、情绪、位置、目标\n\
                    3. 新人物候选：本章中出现的、可能需要加入人物表的新角色\n\
                    4. 伏笔：本章埋设的未解决线索，或回收了之前的伏笔\n\
                    5. 下一章衔接建议：下一章应该承接什么线索或情绪\n\n\
                    然后在 </thinking> 之后严格按照以下 JSON 格式输出：\n\n\
                    {}\n\n\
                    如果某个类别没有内容，返回空数组。\n\
                    必须输出完整 JSON，不可中途截断。",
                    outline,
                    characters_summary,
                    chapter_title,
                    chapter_summary,
                    content,
                    json_template,
                ),
            },
        ]
    }

    /// 构建拆书分析上下文（对资料生成结构化摘要）
    pub fn build_analyze_context(&self, content: &str) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的文学分析助手。你的任务是对给定的资料进行结构化分析，\n\
                    提取关键信息，帮助作者在创作中参考。\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内分析资料结构和关键点，\n\
                    然后在 </thinking> 之后输出结构化摘要。\n\
                    不要输出 Markdown 代码块包裹。",
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请对以下资料进行结构化分析：\n\n\
                    ## 资料\n\n{}\n\n\
                    请先在 <thinking> 标签内分析资料结构和关键点，然后输出：\n\n\
                    ## 核心主题\n（一句话概括资料的核心主题）\n\n\
                    ## 关键要点\n（逐条列出资料中的关键信息，每条不超过两句话）\n\n\
                    ## 可用于创作的元素\n（列出资料中可以用于小说创作的具体元素，如世界观设定、人物原型、情节模板、对话风格等）\n\n\
                    ## 摘要\n（200字以内的整体摘要）",
                    content,
                ),
            },
        ]
    }

    /// 构建写法规则提取上下文（从参考文本提取结构化写法规则）
    pub fn build_extract_rules_context(&self, reference_text: &str) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        let json_template = r#"[
  {
    "rule_type": "narrative|dialogue|pacing|description|emotion|structure",
    "content": "规则内容"
  }
]"#;

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的写作技巧分析师。你的任务是从给定的参考文本中提取可复用的写法规则，\n\
                    帮助作者在后续创作中保持一致的风格。\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内分析文本的写作技巧，\n\
                    然后在 </thinking> 之后严格按照 JSON 数组格式输出规则。\n\
                    不要输出 Markdown，不要使用代码块包裹，不要添加任何解释说明。",
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请从以下参考文本中提取写法规则：\n\n\
                    ## 参考文本\n\n{}\n\n\
                    请先在 <thinking> 标签内分析文本的叙事视角、对话风格、节奏控制、描写手法、情感表达和结构特点，\n\
                    然后在 </thinking> 之后严格按照以下 JSON 数组格式输出提取的规则：\n\n\
                    {}\n\n\
                    rule_type 可选值：\n\
                    - narrative：叙事视角和人称用法\n\
                    - dialogue：对话风格和语气\n\
                    - pacing：节奏控制和章节结构\n\
                    - description：描写手法和感官运用\n\
                    - emotion：情感表达方式\n\
                    - structure：段落结构和过渡技巧\n\n\
                    每条规则用一句话描述。提取 3-8 条最显著的规则。\n\
                    必须输出完整 JSON 数组，不可中途截断。",
                    reference_text,
                    json_template,
                ),
            },
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_context_includes_adjacent_chapter_continuity_requirements() {
        let builder = ContextBuilder::new();
        let messages = builder.build_content_context(
            "主线大纲",
            "人物关系",
            "风雨前夜",
            "主角发现旧案线索，但还没有揭开真相。",
            None,
            "上一章：主角在码头拿到半张船票。",
            "上一章《码头疑云》：主角拿到半张船票，决定追查失踪货船。\n下一章《夜访仓库》：主角将顺着船票线索潜入仓库。",
            None,
            None,
            "",
        );

        let user_prompt = &messages[1].content;
        assert!(user_prompt.contains("上一章正文（供衔接参考）"));
        assert!(user_prompt.contains("上一章：主角在码头拿到半张船票。"));
        assert!(user_prompt.contains("相邻章节衔接"));
        assert!(user_prompt.contains("码头疑云"));
        assert!(user_prompt.contains("夜访仓库"));
        assert!(user_prompt.contains("承接上一章"));
        assert!(user_prompt.contains("铺垫下一章"));
        assert!(user_prompt.contains("避免重复"));
    }
}
