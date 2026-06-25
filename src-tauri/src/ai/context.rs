use crate::ai::client::ChatMessage;
use crate::models::StyleConfig;
use crate::resources;

pub struct ContextBuilder {
    stopwords: Vec<String>,
}

impl ContextBuilder {
    pub fn new() -> Self {
        Self {
            stopwords: resources::load_stopwords(),
        }
    }

    /// 构建大纲生成上下文
    /// existing_content: 大纲中已有的内容，为空时生成全新大纲，非空时在其基础上扩展
    pub fn build_outline_context(&self, project_name: &str, existing_content: &str) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        let user_content = if existing_content.trim().is_empty() {
            format!(
                "请为小说《{}》生成一份完整的大纲。\n\n\
                ## 大纲模板\n\n{}\n\n\
                ## 大纲示例\n\n{}\n\n\
                请先在 <thinking> 标签内简要构思核心冲突、人物方向和情节走向，\
                然后在 </thinking> 之后严格按照模板格式输出完整大纲。\
                确保核心冲突明确、人物方向清晰、情节主线有起承转合。\
                必须输出模板中的所有章节，不可中途截断。\
                避免使用AI味高频词。",
                project_name,
                resources::OUTLINE_TEMPLATE,
                resources::OUTLINE_EXAMPLE,
            )
        } else {
            format!(
                "小说《{}》的大纲已有以下内容，请在其基础上扩展和完善，保留原有内容并补充缺失部分：\n\n\
                ## 已有大纲\n\n{}\n\n\
                ## 大纲模板\n\n{}\n\n\
                请先在 <thinking> 标签内分析已有大纲的完整度和缺失部分，\
                然后在 </thinking> 之后按模板格式输出完整大纲（保留已有内容+补充缺失部分）。\
                必须输出完整大纲，不可中途截断。\
                确保新增内容与已有内容风格一致、逻辑连贯。\
                避免使用AI味高频词。",
                project_name,
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
    pub fn build_characters_context(&self, outline: &str) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

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
                    ]\n\
                    }}\n\n\
                    字段要求：\n\
                    - tier 只能是 \"main\"（主角）、\"supporting\"（重要配角）、\"minor\"（其他角色）\n\
                    - 每个字段必须是字符串，不可省略\n\
                    - characters 至少包含 3 个角色\n\
                    - 人物关系要能推动情节发展\n\
                    - 每个角色都需要清晰的动机和性格多面性\n\n\
                    必须输出完整 JSON，不可中途截断。",
                    outline,
                    resources::CHARACTERS_EXAMPLE,
                ),
            },
        ]
    }

    /// 构建章节目录生成上下文（注入大纲+人物）
    pub fn build_chapters_context(&self, outline: &str, characters_summary: &str) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

        vec![
            ChatMessage {
                role: "system".to_string(),
                content: format!(
                    "你是一位专业的小说创作顾问。请根据大纲和人物信息，帮助用户设计章节目录。\n\n\
                    ## 创作方法论\n\n{}\n\n\
                    ## 避免AI味用词\n\n{}\n\n\
                    ## 输出格式要求\n\n\
                    先在 <thinking> 标签内规划章节节奏和关键转折点，\
                    然后在 </thinking> 之后按模板格式输出章节目录。\
                    必须输出完整的章节列表，不可中途截断。",
                    resources::METHODOLOGY,
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请根据以下大纲和人物信息，为小说设计章节目录。\n\n\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物信息\n\n{}\n\n\
                    ## 章节目录模板\n\n{}\n\n\
                    请先在 <thinking> 标签内规划节奏和转折，\
                    然后在 </thinking> 之后按照模板格式，为每个章节生成标题和摘要（50-100字）。\
                    确保情节推进有节奏感，紧张与缓和交替，每章结尾有悬念或推动力。\
                    必须输出完整章节列表，不可中途截断。\
                    避免使用AI味高频词。",
                    outline,
                    characters_summary,
                    resources::CHAPTERS_TEMPLATE,
                ),
            },
        ]
    }

    /// 构建正文生成上下文（注入大纲+人物+章节+风格+模板）
    pub fn build_content_context(
        &self,
        outline: &str,
        characters_summary: &str,
        chapter_title: &str,
        chapter_summary: &str,
        style_config: Option<&StyleConfig>,
        previous_content: &str,
    ) -> Vec<ChatMessage> {
        let stopwords_hint = self.format_stopwords_hint();

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

        let previous_section = if previous_content.is_empty() {
            String::new()
        } else {
            format!(
                "## 上一章正文（供衔接参考）\n\n{}\n\n",
                previous_content,
            )
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
                    正文必须完整，写到章节结尾，不可中途截断。",
                    resources::METHODOLOGY,
                    stopwords_hint,
                ),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "请撰写以下章节的正文。\n\n\
                    ## 小说大纲\n\n{}\n\n\
                    ## 人物信息\n\n{}\n\n\
                    {}\
                    {}\n\n\
                    ## 当前章节\n\n\
                    标题：{}\n\
                    摘要：{}\n\n\
                    ## 正文写作模板\n\n{}\n\n\
                    请先在 <thinking> 标签内构思场景和对话走向，\
                    然后在 </thinking> 之后严格按照大纲和章节摘要的方向写作，保持人物语言风格一致。\
                    以场景为单位推进，对话与叙述交替，节奏自然。\
                    章节结尾设置悬念或情感高潮。\
                    必须写到章节结尾，不可中途截断。\
                    绝对不要使用AI味高频词。",
                    outline,
                    characters_summary,
                    previous_section,
                    style_section,
                    chapter_title,
                    chapter_summary,
                    resources::CONTENT_TEMPLATE,
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
}
