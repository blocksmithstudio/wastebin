use askama::Template;
use askama_web::WebTemplate;
use axum::extract::State;

use crate::i18n::Lang;
use crate::{Page, handlers::extract::Theme};

/// GET handler for the index page.
pub async fn get(State(page): State<Page>, theme: Option<Theme>, lang: Lang) -> Index {
    Index { page, theme, lang }
}

/// Index page displaying a form for paste insertion.
#[derive(Template, WebTemplate)]
#[template(path = "index.html")]
pub(crate) struct Index {
    page: Page,
    theme: Option<Theme>,
    lang: Lang,
}
