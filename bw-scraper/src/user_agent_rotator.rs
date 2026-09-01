//! User-Agent Rotator
//!
//! Provides user-agent rotation from a pool of legitimate browser user-agents.
//! Ensures no single user-agent is used more than 5 times consecutively.

use std::collections::HashMap;

/// Browser user-agent strings for rotation
/// These are real user-agents from popular browsers on various platforms
const USER_AGENT_POOL: &[&str] = &[
    // Chrome on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    // Chrome on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    // Firefox on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    // Firefox on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
    // Safari on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    // Edge on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
];

const MAX_CONSECUTIVE_USES: usize = 5;

/// User-Agent Rotator
pub struct UserAgentRotator {
    user_agent_pool: Vec<String>,
    consecutive_counts: HashMap<String, usize>,
    last_used_user_agent: Option<String>,
    consecutive_uses: usize,
}

impl UserAgentRotator {
    /// Create a new `UserAgentRotator` with the default pool
    #[must_use]
    pub fn new() -> Self {
        let user_agent_pool: Vec<String> = USER_AGENT_POOL.iter().map(std::string::ToString::to_string).collect();
        let mut consecutive_counts = HashMap::new();

        for ua in &user_agent_pool {
            consecutive_counts.insert(ua.clone(), 0);
        }

        Self {
            user_agent_pool,
            consecutive_counts,
            last_used_user_agent: None,
            consecutive_uses: 0,
        }
    }

    /// Create a new `UserAgentRotator` with a custom pool
    #[must_use]
    pub fn with_pool(pool: &[&str]) -> Self {
        let user_agent_pool: Vec<String> = pool.iter().map(std::string::ToString::to_string).collect();
        let mut consecutive_counts = HashMap::new();

        for ua in &user_agent_pool {
            consecutive_counts.insert(ua.clone(), 0);
        }

        Self {
            user_agent_pool,
            consecutive_counts,
            last_used_user_agent: None,
            consecutive_uses: 0,
        }
    }

    /// Get the next user-agent in rotation
    /// Ensures no single user-agent is used more than `MAX_CONSECUTIVE_USES` times consecutively
    pub fn get_next_user_agent(&mut self) -> String {
        // If all user-agents have reached the limit, reset counts
        let all_at_limit = self.consecutive_counts.values().all(|&count| count >= MAX_CONSECUTIVE_USES);

        if all_at_limit {
            self.reset_counts();
        }

        // Filter out user-agents that have reached the limit
        let available_user_agents: Vec<String> = self.user_agent_pool
            .iter()
            .filter(|ua| {
                let count = self.consecutive_counts.get(*ua).unwrap_or(&0);
                *count < MAX_CONSECUTIVE_USES
            })
            .cloned()
            .collect();

        // If no user-agents are available (shouldn't happen due to reset above), reset and try again
        if available_user_agents.is_empty() {
            self.reset_counts();
            let random_index = fastrand::usize(..self.user_agent_pool.len());
            let selected = self.user_agent_pool[random_index].clone();
            self.last_used_user_agent = Some(selected.clone());
            self.consecutive_uses = 1;
            self.consecutive_counts.insert(selected.clone(), 1);
            return selected;
        }

        // Select a random user-agent from available ones (excluding last used if possible)
        let last_used = self.last_used_user_agent.clone();
        let filtered_pool: Vec<String> = available_user_agents
            .iter()
            .filter(|ua| Some(*ua) != last_used.as_ref())
            .cloned()
            .collect();

        let pool_to_use = if filtered_pool.is_empty() {
            available_user_agents
        } else {
            filtered_pool
        };

        let random_index = fastrand::usize(..pool_to_use.len());
        let selected = pool_to_use[random_index].clone();

        // Update tracking
        self.last_used_user_agent = Some(selected.clone());
        let new_count = self.consecutive_counts.get(&selected).unwrap_or(&0) + 1;
        self.consecutive_uses = new_count;
        self.consecutive_counts.insert(selected.clone(), new_count);

        selected
    }

    /// Reset all consecutive counts
    fn reset_counts(&mut self) {
        for ua in &self.user_agent_pool {
            self.consecutive_counts.insert(ua.clone(), 0);
        }
        self.last_used_user_agent = None;
        self.consecutive_uses = 0;
    }

    /// Get current rotation stats (for debugging)
    #[must_use]
    pub fn get_stats(&self) -> UserAgentStats {
        UserAgentStats {
            total_user_agents: self.user_agent_pool.len(),
            last_used: self.last_used_user_agent.clone(),
            consecutive_uses: self.consecutive_uses,
            counts: self.consecutive_counts.clone(),
        }
    }
}

impl Default for UserAgentRotator {
    fn default() -> Self {
        Self::new()
    }
}

/// Statistics about the user-agent rotator
#[derive(Debug, Clone)]
pub struct UserAgentStats {
    /// Total number of user-agents in the pool
    pub total_user_agents: usize,
    /// The last user-agent used
    pub last_used: Option<String>,
    /// Number of consecutive uses of the last user-agent
    pub consecutive_uses: usize,
    /// Count of uses for each user-agent
    pub counts: HashMap<String, usize>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_returns_valid_user_agent() {
        let mut rotator = UserAgentRotator::new();
        let user_agent = rotator.get_next_user_agent();
        assert!(USER_AGENT_POOL.contains(&user_agent.as_str()));
    }

    #[test]
    fn test_rotates_user_agents() {
        let mut rotator = UserAgentRotator::new();
        let user_agent1 = rotator.get_next_user_agent();
        let user_agent2 = rotator.get_next_user_agent();

        assert!(USER_AGENT_POOL.contains(&user_agent1.as_str()));
        assert!(USER_AGENT_POOL.contains(&user_agent2.as_str()));
    }

    #[test]
    fn test_resets_after_limit() {
        let single_user_agent_pool = &["Mozilla/5.0 Test"];
        let mut single_rotator = UserAgentRotator::with_pool(single_user_agent_pool);

        // Call get_next_user_agent MAX_CONSECUTIVE_USES times
        for _ in 0..MAX_CONSECUTIVE_USES {
            single_rotator.get_next_user_agent();
        }

        // After 5 calls, the next call should reset and return the same user-agent
        let after_reset = single_rotator.get_next_user_agent();
        assert_eq!(after_reset, "Mozilla/5.0 Test");
    }

    #[test]
    fn test_tracks_consecutive_uses() {
        let single_user_agent_pool = &["Mozilla/5.0 Test"];
        let mut single_rotator = UserAgentRotator::with_pool(single_user_agent_pool);

        // First call
        single_rotator.get_next_user_agent();
        let stats = single_rotator.get_stats();
        assert_eq!(stats.consecutive_uses, 1);

        // Continue until we hit the limit
        single_rotator.get_next_user_agent(); // 2
        single_rotator.get_next_user_agent(); // 3
        single_rotator.get_next_user_agent(); // 4
        single_rotator.get_next_user_agent(); // 5

        let stats = single_rotator.get_stats();
        assert_eq!(stats.consecutive_uses, 5);

        // Next call should reset and start over at 1
        single_rotator.get_next_user_agent();
        let stats = single_rotator.get_stats();
        assert_eq!(stats.consecutive_uses, 1);
    }

    #[test]
    fn test_returns_different_user_agents_from_pool() {
        let mut rotator = UserAgentRotator::new();
        let mut used_user_agents = std::collections::HashSet::new();

        // Get 20 user-agents (more than pool size)
        for _ in 0..20 {
            let user_agent = rotator.get_next_user_agent();
            used_user_agents.insert(user_agent);
        }

        // Should have used multiple user-agents from the pool
        assert!(used_user_agents.len() > 1);
    }

    #[test]
    fn test_get_stats_returns_correct_structure() {
        let mut rotator = UserAgentRotator::new();
        rotator.get_next_user_agent();
        let stats = rotator.get_stats();

        assert_eq!(stats.total_user_agents, USER_AGENT_POOL.len());
        assert!(stats.last_used.is_some());
        assert!(stats.consecutive_uses >= 1);
        assert!(!stats.counts.is_empty());
    }
}
