//! Email types for the Black Owned platform.
//!
//! This module provides email-related types for notifications and communications.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Email delivery status
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum EmailStatus {
    /// Email is pending delivery
    Pending,
    /// Email has been sent
    Sent,
    /// Email delivery failed
    Failed(String),
    /// Email was successfully delivered
    Delivered,
    /// Email bounced
    Bounced(String),
}

impl Default for EmailStatus {
    fn default() -> Self {
        Self::Pending
    }
}

/// Email message structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailMessage {
    /// Unique identifier for the email
    pub id: Uuid,
    /// Recipient email address
    pub to: String,
    /// Email subject
    pub subject: String,
    /// Email body content
    pub body: String,
    /// Optional template name used
    pub template_name: Option<String>,
    /// Template variables for rendering
    #[serde(default)]
    pub template_vars: HashMap<String, String>,
    /// Current delivery status
    pub status: EmailStatus,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Sent timestamp
    pub sent_at: Option<DateTime<Utc>>,
    /// Delivery confirmation timestamp
    pub delivered_at: Option<DateTime<Utc>>,
    /// Error message if failed
    pub error_message: Option<String>,
}

impl EmailMessage {
    /// Create a new email message
    ///
    /// # Arguments
    /// * `to` - Recipient email address
    /// * `subject` - Email subject
    /// * `body` - Email body content
    ///
    /// # Returns
    /// A new EmailMessage instance
    #[must_use]
    pub fn new(to: String, subject: String, body: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            to,
            subject,
            body,
            template_name: None,
            template_vars: HashMap::new(),
            status: EmailStatus::default(),
            created_at: Utc::now(),
            sent_at: None,
            delivered_at: None,
            error_message: None,
        }
    }

    /// Create an email message from a template
    ///
    /// # Arguments
    /// * `to` - Recipient email address
    /// * `subject` - Email subject
    /// * `template_name` - Name of the template to use
    /// * `template_vars` - Variables for template rendering
    ///
    /// # Returns
    /// A new EmailMessage instance
    #[must_use]
    pub fn from_template(
        to: String,
        subject: String,
        template_name: String,
        template_vars: HashMap<String, String>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            to,
            subject,
            body: String::new(),
            template_name: Some(template_name),
            template_vars,
            status: EmailStatus::default(),
            created_at: Utc::now(),
            sent_at: None,
            delivered_at: None,
            error_message: None,
        }
    }

    /// Mark email as sent
    pub fn mark_sent(&mut self) {
        self.status = EmailStatus::Sent;
        self.sent_at = Some(Utc::now());
    }

    /// Mark email as delivered
    pub fn mark_delivered(&mut self) {
        self.status = EmailStatus::Delivered;
        self.delivered_at = Some(Utc::now());
    }

    /// Mark email as failed
    ///
    /// # Arguments
    /// * `error` - Error description
    pub fn mark_failed(&mut self, error: String) {
        self.status = EmailStatus::Failed(error.clone());
        self.error_message = Some(error);
    }

    /// Mark email as bounced
    ///
    /// # Arguments
    /// * `reason` - Bounce reason
    pub fn mark_bounced(&mut self, reason: String) {
        self.status = EmailStatus::Bounced(reason.clone());
        self.error_message = Some(reason);
    }

    /// Check if email is pending
    #[must_use]
    pub fn is_pending(&self) -> bool {
        matches!(self.status, EmailStatus::Pending)
    }

    /// Check if email was successfully delivered
    #[must_use]
    pub fn is_delivered(&self) -> bool {
        matches!(self.status, EmailStatus::Delivered)
    }

    /// Check if email failed
    #[must_use]
    pub fn is_failed(&self) -> bool {
        matches!(self.status, EmailStatus::Failed(_))
    }
}

/// NATS email payload for message queue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NatsEmailPayload {
    /// Recipient email address
    pub to: String,
    /// Email subject
    pub subject: String,
    /// Email body content
    pub body: String,
    /// Optional template name
    pub template_name: Option<String>,
    /// Template variables
    #[serde(default)]
    pub template_vars: HashMap<String, String>,
}

impl NatsEmailPayload {
    /// Create a new NATS email payload
    ///
    /// # Arguments
    /// * `to` - Recipient email address
    /// * `subject` - Email subject
    /// * `body` - Email body content
    ///
    /// # Returns
    /// A new NatsEmailPayload instance
    #[must_use]
    pub fn new(to: String, subject: String, body: String) -> Self {
        Self {
            to,
            subject,
            body,
            template_name: None,
            template_vars: HashMap::new(),
        }
    }

    /// Create a payload with template
    ///
    /// # Arguments
    /// * `to` - Recipient email address
    /// * `subject` - Email subject
    /// * `template_name` - Template name
    /// * `template_vars` - Template variables
    ///
    /// # Returns
    /// A new NatsEmailPayload instance
    #[must_use]
    pub fn with_template(
        to: String,
        subject: String,
        template_name: String,
        template_vars: HashMap<String, String>,
    ) -> Self {
        Self {
            to,
            subject,
            body: String::new(),
            template_name: Some(template_name),
            template_vars,
        }
    }
}

/// SMTP configuration
#[derive(Debug, Clone)]
pub struct SmtpConfig {
    /// SMTP server host
    pub host: String,
    /// SMTP server port
    pub port: u16,
    /// Username for authentication
    pub username: Option<String>,
    /// Password for authentication
    pub password: Option<String>,
    /// Whether to use TLS
    pub use_tls: bool,
    /// Sender email address
    pub from_email: String,
    /// Sender display name
    pub from_name: String,
}

impl Default for SmtpConfig {
    fn default() -> Self {
        Self {
            host: "localhost".to_string(),
            port: 587,
            username: None,
            password: None,
            use_tls: true,
            from_email: "noreply@blackowned.com".to_string(),
            from_name: "Black Owned".to_string(),
        }
    }
}

impl SmtpConfig {
    /// Create a new SMTP config
    ///
    /// # Arguments
    /// * `host` - SMTP server host
    /// * `port` - SMTP server port
    /// * `from_email` - Sender email address
    ///
    /// # Returns
    /// A new SmtpConfig instance
    #[must_use]
    pub fn new(host: String, port: u16, from_email: String) -> Self {
        Self {
            host,
            port,
            from_email,
            ..Default::default()
        }
    }

    /// Set username
    #[must_use]
    pub fn with_username(mut self, username: String) -> Self {
        self.username = Some(username);
        self
    }

    /// Set password
    #[must_use]
    pub fn with_password(mut self, password: String) -> Self {
        self.password = Some(password);
        self
    }

    /// Enable/disable TLS
    #[must_use]
    pub fn with_tls(mut self, use_tls: bool) -> Self {
        self.use_tls = use_tls;
        self
    }

    /// Set sender name
    #[must_use]
    pub fn with_from_name(mut self, from_name: String) -> Self {
        self.from_name = from_name;
        self
    }
}

/// Email template for rendering
#[derive(Debug, Clone)]
pub struct EmailTemplate {
    /// Template name
    pub name: String,
    /// Template subject line
    pub subject: String,
    /// Template body content
    pub body: String,
}

impl EmailTemplate {
    /// Create a new email template
    ///
    /// # Arguments
    /// * `name` - Template name
    /// * `subject` - Subject line template
    /// * `body` - Body template
    ///
    /// # Returns
    /// A new EmailTemplate instance
    #[must_use]
    pub fn new(name: String, subject: String, body: String) -> Self {
        Self {
            name,
            subject,
            body,
        }
    }

    /// Render the template with variables
    ///
    /// # Arguments
    /// * `vars` - Variable substitutions
    ///
    /// # Returns
    /// Rendered template string
    #[must_use]
    pub fn render(&self, vars: &HashMap<String, String>) -> String {
        let mut rendered = self.body.clone();
        for (key, value) in vars {
            let placeholder = format!("{{{{{}}}}}", key);
            rendered = rendered.replace(&placeholder, value);
        }
        rendered
    }

    /// Render the subject with variables
    ///
    /// # Arguments
    /// * `vars` - Variable substitutions
    ///
    /// # Returns
    /// Rendered subject string
    #[must_use]
    pub fn render_subject(&self, vars: &HashMap<String, String>) -> String {
        let mut rendered = self.subject.clone();
        for (key, value) in vars {
            let placeholder = format!("{{{{{}}}}}", key);
            rendered = rendered.replace(&placeholder, value);
        }
        rendered
    }
}

/// Dead Letter Queue message for failed emails
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DlqEmailMessage {
    /// Original email payload
    pub payload: NatsEmailPayload,
    /// Error that caused failure
    pub error: String,
    /// Timestamp of failure
    pub failed_at: DateTime<Utc>,
    /// Number of retry attempts
    pub attempt_count: u32,
}

impl DlqEmailMessage {
    /// Create a new DLQ message
    ///
    /// # Arguments
    /// * `payload` - Original email payload
    /// * `error` - Error description
    /// * `attempt_count` - Number of attempts made
    ///
    /// # Returns
    /// A new DlqEmailMessage instance
    #[must_use]
    pub fn new(payload: NatsEmailPayload, error: String, attempt_count: u32) -> Self {
        Self {
            payload,
            error,
            failed_at: Utc::now(),
            attempt_count,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_message_creation() {
        let email = EmailMessage::new(
            "test@example.com".to_string(),
            "Test Subject".to_string(),
            "Test body".to_string(),
        );

        assert_eq!(email.to, "test@example.com");
        assert_eq!(email.subject, "Test Subject");
        assert_eq!(email.body, "Test body");
        assert!(email.is_pending());
        assert!(email.sent_at.is_none());
        assert!(email.delivered_at.is_none());
    }

    #[test]
    fn test_email_mark_sent() {
        let mut email = EmailMessage::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );

        email.mark_sent();

        assert!(matches!(email.status, EmailStatus::Sent));
        assert!(email.sent_at.is_some());
        assert!(!email.is_pending());
    }

    #[test]
    fn test_email_mark_delivered() {
        let mut email = EmailMessage::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );

        email.mark_sent();
        email.mark_delivered();

        assert!(email.is_delivered());
        assert!(email.delivered_at.is_some());
    }

    #[test]
    fn test_email_mark_failed() {
        let mut email = EmailMessage::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );

        email.mark_failed("Connection refused".to_string());

        assert!(email.is_failed());
        assert_eq!(email.error_message, Some("Connection refused".to_string()));
    }

    #[test]
    fn test_email_mark_bounced() {
        let mut email = EmailMessage::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );

        email.mark_bounced("User unknown".to_string());

        assert!(matches!(email.status, EmailStatus::Bounced(_)));
        assert_eq!(email.error_message, Some("User unknown".to_string()));
    }

    #[test]
    fn test_template_render() {
        let template = EmailTemplate::new(
            "test".to_string(),
            "Hello {{name}}".to_string(),
            "Hi {{name}}, your code is {{code}}".to_string(),
        );

        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "John".to_string());
        vars.insert("code".to_string(), "123456".to_string());

        let rendered = template.render(&vars);
        assert_eq!(rendered, "Hi John, your code is 123456");

        let rendered_subject = template.render_subject(&vars);
        assert_eq!(rendered_subject, "Hello John");
    }

    #[test]
    fn test_template_render_missing_vars() {
        let template = EmailTemplate::new(
            "test".to_string(),
            "Hello {{name}}".to_string(),
            "Hi {{name}}, code: {{code}}".to_string(),
        );

        let vars = HashMap::new();
        let rendered = template.render(&vars);

        // Missing variables should remain as placeholders
        assert!(rendered.contains("{{name}}"));
        assert!(rendered.contains("{{code}}"));
    }

    #[test]
    fn test_nats_payload_creation() {
        let payload = NatsEmailPayload::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );

        assert_eq!(payload.to, "test@example.com");
        assert!(payload.template_name.is_none());
        assert!(payload.template_vars.is_empty());
    }

    #[test]
    fn test_nats_payload_with_template() {
        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "Alice".to_string());

        let payload = NatsEmailPayload::with_template(
            "alice@example.com".to_string(),
            "Welcome".to_string(),
            "welcome".to_string(),
            vars.clone(),
        );

        assert_eq!(payload.to, "alice@example.com");
        assert_eq!(payload.template_name, Some("welcome".to_string()));
        assert_eq!(payload.template_vars, vars);
    }

    #[test]
    fn test_smtp_config_builder() {
        let config = SmtpConfig::new(
            "smtp.example.com".to_string(),
            587,
            "noreply@example.com".to_string(),
        )
        .with_username("user".to_string())
        .with_password("pass".to_string())
        .with_tls(true)
        .with_from_name("Example".to_string());

        assert_eq!(config.host, "smtp.example.com");
        assert_eq!(config.port, 587);
        assert_eq!(config.username, Some("user".to_string()));
        assert_eq!(config.password, Some("pass".to_string()));
        assert!(config.use_tls);
        assert_eq!(config.from_name, "Example");
    }

    #[test]
    fn test_dlq_message_creation() {
        let payload = NatsEmailPayload::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );

        let dlq = DlqEmailMessage::new(payload.clone(), "Max retries exceeded".to_string(), 5);

        assert_eq!(dlq.payload.to, "test@example.com");
        assert_eq!(dlq.error, "Max retries exceeded");
        assert_eq!(dlq.attempt_count, 5);
        assert!(dlq.failed_at <= Utc::now());
    }

    #[test]
    fn test_email_status_default() {
        let status: EmailStatus = Default::default();
        assert!(matches!(status, EmailStatus::Pending));
    }

    #[test]
    fn test_email_serialization() {
        let mut email = EmailMessage::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );
        email.mark_sent();

        let json = serde_json::to_string(&email).unwrap();
        let deserialized: EmailMessage = serde_json::from_str(&json).unwrap();

        assert_eq!(email.id, deserialized.id);
        assert_eq!(email.to, deserialized.to);
        assert_eq!(email.status, deserialized.status);
    }
}
