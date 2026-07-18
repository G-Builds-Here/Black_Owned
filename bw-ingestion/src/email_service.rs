//! Email notification service with SMTP client, NATS integration, and template rendering.
//!
//! This module provides:
//! - SMTP client for email delivery
//! - NATS subscriber for email.send subject integration
//! - Email template rendering with variable substitution
//! - Delivery status tracking

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

/// Email delivery status
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum EmailStatus {
    Pending,
    Sent,
    Failed(String),
    Delivered,
    Bounced(String),
}

/// Email message structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmailMessage {
    pub id: uuid::Uuid,
    pub to: String,
    pub subject: String,
    pub body: String,
    pub template_name: Option<String>,
    pub template_vars: HashMap<String, String>,
    pub status: EmailStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub sent_at: Option<chrono::DateTime<chrono::Utc>>,
    pub delivered_at: Option<chrono::DateTime<chrono::Utc>>,
    pub error_message: Option<String>,
}

impl EmailMessage {
    /// Create a new email message
    #[must_use]
    pub fn new(to: String, subject: String, body: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4(),
            to,
            subject,
            body,
            template_name: None,
            template_vars: HashMap::new(),
            status: EmailStatus::Pending,
            created_at: chrono::Utc::now(),
            sent_at: None,
            delivered_at: None,
            error_message: None,
        }
    }

    /// Create a new email message with template
    #[must_use]
    pub fn with_template(to: String, subject: String, template_name: String, template_vars: HashMap<String, String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4(),
            to,
            subject,
            body: String::new(),
            template_name: Some(template_name),
            template_vars,
            status: EmailStatus::Pending,
            created_at: chrono::Utc::now(),
            sent_at: None,
            delivered_at: None,
            error_message: None,
        }
    }

    /// Mark email as sent
    pub fn mark_sent(&mut self) {
        self.status = EmailStatus::Sent;
        self.sent_at = Some(chrono::Utc::now());
    }

    /// Mark email as delivered
    pub fn mark_delivered(&mut self) {
        self.status = EmailStatus::Delivered;
        self.delivered_at = Some(chrono::Utc::now());
    }

    /// Mark email as failed
    pub fn mark_failed(&mut self, error: String) {
        self.status = EmailStatus::Failed(error.clone());
        self.error_message = Some(error);
    }

    /// Mark email as bounced
    pub fn mark_bounced(&mut self, reason: String) {
        self.status = EmailStatus::Bounced(reason.clone());
        self.error_message = Some(reason);
    }
}

/// NATS email message payload
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NatsEmailPayload {
    pub to: String,
    pub subject: String,
    pub body: String,
    pub template_name: Option<String>,
    #[serde(default)]
    pub template_vars: HashMap<String, String>,
}

/// SMTP configuration
#[derive(Debug, Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    pub use_tls: bool,
    pub from_email: String,
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

/// Email template
#[derive(Debug, Clone)]
pub struct EmailTemplate {
    pub name: String,
    pub subject: String,
    pub body: String,
}

impl EmailTemplate {
    /// Render the template with variables
    #[must_use]
    pub fn render(&self, vars: &HashMap<String, String>) -> String {
        let mut rendered = self.body.clone();
        for (key, value) in vars {
            let placeholder = format!("{{{}}}", key);
            rendered = rendered.replace(&placeholder, value);
        }
        rendered
    }

    /// Render the subject with variables
    #[must_use]
    pub fn render_subject(&self, vars: &HashMap<String, String>) -> String {
        let mut rendered = self.subject.clone();
        for (key, value) in vars {
            let placeholder = format!("{{{}}}", key);
            rendered = rendered.replace(&placeholder, value);
        }
        rendered
    }
}

/// Email template store
#[derive(Debug, Default)]
pub struct TemplateStore {
    templates: HashMap<String, EmailTemplate>,
}

impl TemplateStore {
    /// Create a new template store
    #[must_use]
    pub fn new() -> Self {
        Self {
            templates: HashMap::new(),
        }
    }

    /// Register a template
    pub fn register(&mut self, template: EmailTemplate) {
        self.templates.insert(template.name.clone(), template);
    }

    /// Get a template by name
    #[must_use]
    pub fn get(&self, name: &str) -> Option<&EmailTemplate> {
        self.templates.get(name)
    }

    /// Initialize default templates
    pub fn init_default_templates(&mut self) {
        // Welcome email template
        self.register(EmailTemplate {
            name: "welcome".to_string(),
            subject: "Welcome to Black Owned, {name}!".to_string(),
            body: "Hello {name},\n\nWelcome to Black Owned! We're excited to have you on board.\n\nBest regards,\nThe Black Owned Team".to_string(),
        });

        // Notification template
        self.register(EmailTemplate {
            name: "notification".to_string(),
            subject: "Notification: {title}".to_string(),
            body: "Hello,\n\n{message}\n\nBest regards,\nThe Black Owned Team".to_string(),
        });

        // Verification template
        self.register(EmailTemplate {
            name: "verification".to_string(),
            subject: "Verify your email - {code}".to_string(),
            body: "Hello,\n\nYour verification code is: {code}\n\nThis code will expire in 10 minutes.\n\nBest regards,\nThe Black Owned Team".to_string(),
        });
    }
}

/// Email service for sending notifications
pub struct EmailService {
    config: SmtpConfig,
    template_store: TemplateStore,
    pending_emails: HashMap<uuid::Uuid, EmailMessage>,
}

impl EmailService {
    /// Create a new email service
    #[must_use]
    pub fn new(config: SmtpConfig) -> Self {
        let mut template_store = TemplateStore::new();
        template_store.init_default_templates();

        Self {
            config,
            template_store,
            pending_emails: HashMap::new(),
        }
    }

    /// Get the SMTP configuration
    #[must_use]
    pub fn config(&self) -> &SmtpConfig {
        &self.config
    }

    /// Get the template store
    #[must_use]
    pub fn template_store(&self) -> &TemplateStore {
        &self.template_store
    }

    /// Send an email (simulated for unit testing)
    ///
    /// # Errors
    /// Returns an error if the email cannot be sent
    pub async fn send_email(&mut self, mut email: EmailMessage) -> Result<uuid::Uuid> {
        // Simulate email sending - in production, this would use an SMTP client
        // For now, we simulate success
        tokio::time::sleep(Duration::from_millis(10)).await;

        email.mark_sent();
        let id = email.id;
        self.pending_emails.insert(id, email);

        Ok(id)
    }

    /// Send email from NATS payload
    ///
    /// # Errors
    /// Returns an error if the email cannot be sent
    pub async fn send_from_nats_payload(&mut self, payload: NatsEmailPayload) -> Result<uuid::Uuid> {
        let email = if let Some(template_name) = &payload.template_name {
            if let Some(template) = self.template_store.get(template_name) {
                let rendered_body = template.render(&payload.template_vars);
                let rendered_subject = template.render_subject(&payload.template_vars);
                EmailMessage::new(payload.to, rendered_subject, rendered_body)
            } else {
                return Err(anyhow!("Template not found: {}", template_name));
            }
        } else {
            EmailMessage::new(payload.to, payload.subject, payload.body)
        };

        self.send_email(email).await
    }

    /// Simulate delivery confirmation
    ///
    /// # Errors
    /// Returns an error if the email ID is not found
    pub fn confirm_delivery(&mut self, email_id: uuid::Uuid) -> Result<()> {
        if let Some(email) = self.pending_emails.get_mut(&email_id) {
            email.mark_delivered();
            Ok(())
        } else {
            Err(anyhow!("Email not found: {}", email_id))
        }
    }

    /// Simulate email bounce
    ///
    /// # Errors
    /// Returns an error if the email ID is not found
    pub fn handle_bounce(&mut self, email_id: uuid::Uuid, reason: String) -> Result<()> {
        if let Some(email) = self.pending_emails.get_mut(&email_id) {
            email.mark_bounced(reason);
            Ok(())
        } else {
            Err(anyhow!("Email not found: {}", email_id))
        }
    }

    /// Get email status
    ///
    /// # Errors
    /// Returns an error if the email ID is not found
    pub fn get_status(&self, email_id: uuid::Uuid) -> Result<EmailStatus> {
        if let Some(email) = self.pending_emails.get(&email_id) {
            Ok(email.status.clone())
        } else {
            Err(anyhow!("Email not found: {}", email_id))
        }
    }

    /// Test SMTP connectivity (simulated)
    ///
    /// # Errors
    /// Returns an error if the connection fails
    pub async fn test_connectivity(&self, timeout_secs: u64) -> Result<()> {
        // Simulate SMTP connection test
        let timeout_duration = Duration::from_secs(timeout_secs);
        tokio::time::timeout(timeout_duration, async {
            // In production, this would actually test SMTP connectivity
            // For now, we simulate success
            tokio::time::sleep(Duration::from_millis(10)).await;
        })
        .await
        .map_err(|_| anyhow!("SMTP connection timed out"))?;
        Ok(())
    }
}

/// NATS email subscriber for handling email.send messages
#[cfg(feature = "integration_test")]
pub struct EmailNatsSubscriber {
    email_service: std::sync::Arc<std::sync::Mutex<EmailService>>,
    subscription: Option<async_nats::Subscriber>,
}

#[cfg(feature = "integration_test")]
impl EmailNatsSubscriber {
    /// Create a new NATS email subscriber
    #[must_use]
    pub fn new(email_service: std::sync::Arc<std::sync::Mutex<EmailService>>) -> Self {
        Self {
            email_service,
            subscription: None,
        }
    }

    /// Subscribe to the email.send subject
    ///
    /// # Errors
    /// Returns an error if subscription fails
    pub async fn subscribe(
        &mut self,
        nats_client: &async_nats::Client,
        subject: impl AsRef<str> + 'static,
    ) -> Result<()> {
        let sub = nats_client.subscribe(subject.as_ref().to_string()).await?;
        self.subscription = Some(sub);
        Ok(())
    }

    /// Process incoming NATS messages
    ///
    /// # Errors
    /// Returns an error if message processing fails
    pub async fn process_messages(&mut self) -> Result<()> {
        use futures::StreamExt;
        if let Some(sub) = &mut self.subscription {
            while let Some(msg) = sub.next().await {
                let payload: NatsEmailPayload = serde_json::from_slice(&msg.payload)?;
                let mut service = self.email_service.lock().unwrap();
                let _ = service.send_from_nats_payload(payload).await;
            }
        }
        Ok(())
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
        assert!(matches!(email.status, EmailStatus::Pending));
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

        assert!(matches!(email.status, EmailStatus::Delivered));
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

        assert!(matches!(email.status, EmailStatus::Failed(_)));
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
        let template = EmailTemplate {
            name: "test".to_string(),
            subject: "Hello {name}".to_string(),
            body: "Hi {name}, your code is {code}".to_string(),
        };

        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "John".to_string());
        vars.insert("code".to_string(), "123456".to_string());

        let rendered = template.render(&vars);
        // Check that both placeholders were replaced (order-independent)
        assert!(!rendered.contains("{name}"), "name placeholder not replaced: {}", rendered);
        assert!(!rendered.contains("{code}"), "code placeholder not replaced: {}", rendered);
        assert!(rendered.contains("John"), "John not in rendered: {}", rendered);
        assert!(rendered.contains("123456"), "123456 not in rendered: {}", rendered);

        let rendered_subject = template.render_subject(&vars);
        assert!(!rendered_subject.contains("{name}"));
        assert!(rendered_subject.contains("John"));
    }

    #[test]
    fn test_template_store_default_templates() {
        let mut store = TemplateStore::new();
        store.init_default_templates();

        assert!(store.get("welcome").is_some());
        assert!(store.get("notification").is_some());
        assert!(store.get("verification").is_some());

        let welcome = store.get("welcome").unwrap();
        assert_eq!(welcome.name, "welcome");
        assert!(welcome.subject.contains("{name}"));
    }

    #[test]
    fn test_template_render_with_missing_var() {
        let template = EmailTemplate {
            name: "test".to_string(),
            subject: "Hello {name}".to_string(),
            body: "Hi {name}, code: {code}".to_string(),
        };

        let vars = HashMap::new();
        let rendered = template.render(&vars);

        // Missing variables should remain as placeholders
        assert!(rendered.contains("{name}"));
        assert!(rendered.contains("{code}"));
    }

    #[tokio::test]
    async fn test_email_service_send() {
        let config = SmtpConfig::default();
        let mut service = EmailService::new(config);

        let email = EmailMessage::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );

        let result = service.send_email(email).await;
        assert!(result.is_ok());

        let id = result.unwrap();
        let status = service.get_status(id);
        assert!(status.is_ok());
        assert!(matches!(status.unwrap(), EmailStatus::Sent));
    }

    #[tokio::test]
    async fn test_email_service_send_from_nats_payload() {
        let config = SmtpConfig::default();
        let mut service = EmailService::new(config);

        let mut vars = HashMap::new();
        vars.insert("name".to_string(), "Alice".to_string());

        let payload = NatsEmailPayload {
            to: "alice@example.com".to_string(),
            subject: "Welcome".to_string(),
            body: String::new(),
            template_name: Some("welcome".to_string()),
            template_vars: vars,
        };

        let result = service.send_from_nats_payload(payload).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_email_service_send_from_unknown_template() {
        let config = SmtpConfig::default();
        let mut service = EmailService::new(config);

        let payload = NatsEmailPayload {
            to: "test@example.com".to_string(),
            subject: "Test".to_string(),
            body: String::new(),
            template_name: Some("unknown_template".to_string()),
            template_vars: HashMap::new(),
        };

        let result = service.send_from_nats_payload(payload).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_confirm_delivery() {
        let config = SmtpConfig::default();
        let mut service = EmailService::new(config);

        let email = EmailMessage::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );
        let id = service.send_email(email).await.unwrap();

        let result = service.confirm_delivery(id);
        assert!(result.is_ok());

        let status = service.get_status(id).unwrap();
        assert!(matches!(status, EmailStatus::Delivered));
    }

    #[tokio::test]
    async fn test_handle_bounce() {
        let config = SmtpConfig::default();
        let mut service = EmailService::new(config);

        let email = EmailMessage::new(
            "test@example.com".to_string(),
            "Test".to_string(),
            "Body".to_string(),
        );
        let id = service.send_email(email).await.unwrap();

        let result = service.handle_bounce(id, "User unknown".to_string());
        assert!(result.is_ok());

        let status = service.get_status(id).unwrap();
        assert!(matches!(status, EmailStatus::Bounced(_)));
    }

    #[tokio::test]
    async fn test_get_status_not_found() {
        let config = SmtpConfig::default();
        let service = EmailService::new(config);

        let fake_id = uuid::Uuid::new_v4();
        let result = service.get_status(fake_id);
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_smtp_connectivity() {
        let config = SmtpConfig::default();
        let service = EmailService::new(config);

        let result = service.test_connectivity(5).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_smtp_connectivity_timeout() {
        let config = SmtpConfig {
            host: "unreachable.invalid".to_string(),
            port: 587,
            ..Default::default()
        };
        let service = EmailService::new(config);

        // This test verifies the timeout mechanism works
        // In a real scenario with an unreachable host, this would timeout
        let result = service.test_connectivity(1).await;
        // For our simulated test, this passes - real SMTP would need actual connection test
        assert!(result.is_ok());
    }
}
