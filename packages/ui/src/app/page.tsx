"use client";

import { BusinessCard } from "../components/BusinessCard";
import { StarRating } from "../components/StarRating";
import { VerifiedBadge } from "../components/VerifiedBadge";
import { SearchBar } from "../components/SearchBar";
import { NotificationBanner } from "../components/NotificationBanner";
import { Pagination } from "../components/Pagination";
import { FilterSidebar } from "../components/FilterSidebar";
import { ChatBubble } from "../components/ChatBubble";
import { useState } from "react";

export default function Home() {
  const [searchValue, setSearchValue] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const filterOptions = [
    { label: "Food & Dining", value: "food" },
    { label: "Professional Services", value: "professional" },
    { label: "Retail", value: "retail" },
    { label: "Health & Wellness", value: "health" },
  ];

  return (
    <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Cultural header accent */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Black Owned Business Directory</h1>
        <p style={{ color: "var(--color-neutral-600)", marginBottom: "1.5rem" }}>
          Celebrating and connecting with Black-owned businesses in our community
        </p>

        {/* Cultural pattern divider */}
        <hr className="divider-accent" />
      </div>

      {/* Notification example */}
      <NotificationBanner
        type="success"
        message="Welcome to our Black-owned business community!"
      />

      {/* Search section */}
      <div style={{ marginBottom: "2rem" }}>
        <SearchBar
          placeholder="Search businesses by name, category, or location..."
          value={searchValue}
          onChange={setSearchValue}
        />
      </div>

      {/* Main content area */}
      <div style={{ display: "flex", gap: "2rem" }}>
        {/* Filter Sidebar */}
        <aside style={{ width: "250px", flexShrink: 0 }}>
          <FilterSidebar
            title="Categories"
            options={filterOptions}
            selectedValues={selectedFilters}
            onChange={setSelectedFilters}
          />
        </aside>

        {/* Business Cards Grid */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            <BusinessCard
              businessName="Soul Food Kitchen"
              rating={4.8}
              description="Authentic Southern cuisine celebrating generations of Black culinary tradition."
              address="123 Heritage Lane"
            />
            <BusinessCard
              businessName="Golden Era Consulting"
              rating={5.0}
              description="Empowering Black entrepreneurs with strategic business guidance."
              address="456 Prosperity Blvd"
            />
            <BusinessCard
              businessName="Ancestry Art Studio"
              rating={4.9}
              description="Custom portraits and art celebrating Black heritage and family legacy."
              address="789 Culture Street"
            />
          </div>

          {/* Pagination */}
          <div style={{ marginTop: "2rem" }}>
            <Pagination
              currentPage={currentPage}
              totalPages={5}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>

      {/* Chat example section */}
      <div style={{ marginTop: "3rem" }}>
        <h2>Community Chat</h2>
        <div style={{ background: "var(--color-neutral-100)", padding: "1.5rem", borderRadius: "var(--radius-lg)", marginTop: "1rem" }}>
          <ChatBubble
            direction="received"
            message="So proud to support local Black-owned businesses!"
            senderName="Community Member"
            timestamp="2:30 PM"
          />
          <ChatBubble
            direction="sent"
            message="Thank you for your support! Together we build economic strength."
            timestamp="2:32 PM"
          />
        </div>
      </div>

      {/* Cultural footer accent */}
      <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid var(--color-earth-sand)" }}>
        <p style={{ textAlign: "center", color: "var(--color-neutral-500)", fontSize: "0.875rem" }}>
          <span style={{ color: "var(--color-gold-600)" }}>★</span> Supporting Black Excellence <span style={{ color: "var(--color-gold-600)" }}>★</span>
        </p>
      </div>
    </main>
  );
}
