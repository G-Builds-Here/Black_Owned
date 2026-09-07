/**
 * Business Content Editor
 *
 * Admin form for manually editing a business's content fields
 * (website, phone, menu_url, image_url, description, social_urls).
 * Pre-filled from the business row fetched by the admin content route;
 * only fields the admin actually changed are sent on save (partial save),
 * and the form re-renders with the values returned by the PATCH response.
 */

'use client';

import React, { useState } from 'react';
import { Card, Button, Input } from '@/components/ui';
import { authHeaders } from '@/lib/auth/client-session';

export interface SocialEntry {
  platform: string;
  url: string;
}

export interface BusinessContent {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  menuUrl: string | null;
  imageUrl: string | null;
  description: string | null;
  socialUrls: SocialEntry[] | null;
}

interface BusinessContentEditorProps {
  business: BusinessContent;
  onSaved: (business: BusinessContent) => void;
}

const TEXTAREA_STYLES = `
  w-full px-4 py-2.5 text-base
  bg-white border border-neutral-300 rounded-lg
  transition-all duration-150
  focus:outline-none focus:ring-2 focus:ring-offset-2
  focus:border-heritage-ochre focus:ring-heritage-ochre
`;

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-neutral-700 mb-1.5">
      {children}
    </label>
  );
}

export default function BusinessContentEditor({ business, onSaved }: BusinessContentEditorProps) {
  const [website, setWebsite] = useState(business.website ?? '');
  const [phone, setPhone] = useState(business.phone ?? '');
  const [menuUrl, setMenuUrl] = useState(business.menuUrl ?? '');
  const [imageUrl, setImageUrl] = useState(business.imageUrl ?? '');
  const [description, setDescription] = useState(business.description ?? '');
  const [socials, setSocials] = useState<SocialEntry[]>(business.socialUrls ?? []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);

  const applySaved = (next: BusinessContent) => {
    setWebsite(next.website ?? '');
    setPhone(next.phone ?? '');
    setMenuUrl(next.menuUrl ?? '');
    setImageUrl(next.imageUrl ?? '');
    setDescription(next.description ?? '');
    setSocials(next.socialUrls ?? []);
  };

  const updateSocial = (index: number, patch: Partial<SocialEntry>) => {
    setSocials((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  const buildPayload = (): Record<string, string | null | SocialEntry[] | null> => {
    const payload: Record<string, string | null | SocialEntry[] | null> = {};
    if (website !== (business.website ?? '')) payload.website = website || null;
    if (phone !== (business.phone ?? '')) payload.phone = phone || null;
    if (menuUrl !== (business.menuUrl ?? '')) payload.menuUrl = menuUrl || null;
    if (imageUrl !== (business.imageUrl ?? '')) payload.imageUrl = imageUrl || null;
    if (description !== (business.description ?? '')) payload.description = description || null;
    const initialSocials = business.socialUrls ?? [];
    if (JSON.stringify(socials) !== JSON.stringify(initialSocials)) {
      payload.socialUrls = socials.length > 0 ? socials : null;
    }
    return payload;
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/businesses/${business.id}/content`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (result.success) {
        const next = result.data.business as BusinessContent;
        applySaved(next);
        setMessage({ success: true, text: 'Content saved' });
        onSaved(next);
      } else {
        setMessage({ success: false, text: result.error || 'Failed to save content' });
      }
    } catch {
      setMessage({ success: false, text: 'Failed to save content' });
    } finally {
      setSaving(false);
    }
  };

  const dirty = Object.keys(buildPayload()).length > 0;

  return (
    <Card variant="elevated" padding="lg" className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-neutral-900">{business.name}</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Manually fix content the enrichment pipeline missed or got wrong. Clear a field to
          remove it; only changed fields are written.
        </p>
      </div>

      {message && (
        <div
          role="status"
          className={`p-3 rounded-lg ${
            message.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Website"
          id="content-website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com"
          helperText="Max 255 characters"
          fullWidth
        />
        <Input
          label="Phone"
          id="content-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+15551112222"
          helperText="Max 50 characters"
          fullWidth
        />
        <Input
          label="Menu URL"
          id="content-menu-url"
          value={menuUrl}
          onChange={(e) => setMenuUrl(e.target.value)}
          placeholder="https://example.com/menu"
          helperText="Max 500 characters"
          fullWidth
        />
        <Input
          label="Image URL"
          id="content-image-url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://example.com/photo.jpg"
          helperText="Max 500 characters"
          fullWidth
        />
      </div>

      <div>
        <FieldLabel htmlFor="content-description">Description</FieldLabel>
        <textarea
          id="content-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="Business description"
          className={TEXTAREA_STYLES}
        />
        <p className="mt-1.5 text-sm text-neutral-500">Max 2000 characters</p>
      </div>

      <div>
        <FieldLabel htmlFor="content-social-add">Social Links</FieldLabel>
        <div className="space-y-2">
          {socials.map((entry, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="w-40">
                <Input
                  aria-label={`Social platform ${index + 1}`}
                  value={entry.platform}
                  onChange={(e) => updateSocial(index, { platform: e.target.value })}
                  placeholder="instagram"
                  fullWidth
                />
              </div>
              <div className="flex-1">
                <Input
                  aria-label={`Social URL ${index + 1}`}
                  value={entry.url}
                  onChange={(e) => updateSocial(index, { url: e.target.value })}
                  placeholder="https://instagram.com/..."
                  fullWidth
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSocials((prev) => prev.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => setSocials((prev) => [...prev, { platform: '', url: '' }])}
        >
          Add Social Link
        </Button>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="primary" size="md" onClick={handleSave} isLoading={saving} disabled={!dirty} loadingText="Saving...">
          Save Changes
        </Button>
      </div>
    </Card>
  );
}
