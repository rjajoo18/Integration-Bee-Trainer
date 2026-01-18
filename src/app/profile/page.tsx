"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Profile = {
  id: number;
  name: string | null;
  email: string | null;
  bio: string | null;
  is_public: boolean;
  image: string | null;
};

export default function ProfilePage() {
  const { status } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/profile")
      .then((r) => r.json())
      .then(setProfile)
      .catch(() => setMsg("Failed to load profile"));
  }, [status]);

  if (status === "loading") return <div className="p-6 text-white">Loading…</div>;
  if (status === "unauthenticated") return <div className="p-6 text-white">Please sign in.</div>;
  if (!profile) return <div className="p-6 text-white">Loading profile…</div>;

  const p = profile;

  async function save() {
    setSaving(true);
    setMsg("");

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        bio: p.bio,
        isPublic: p.is_public,
        image: p.image,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setMsg((data as any)?.error ?? "Save failed");
      return;
    }

    setProfile(data);
    setMsg("Saved!");
    setTimeout(() => setMsg(""), 1500);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 300_000) {
      setMsg("Image too big. Use < 300KB for now.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfile((prev) => (prev ? { ...prev, image: String(reader.result) } : prev));
    };
    reader.readAsDataURL(file);
  }

  const msgClass =
    msg && msg.toLowerCase().includes("saved")
      ? "border-green-500/50 bg-green-500/10 text-green-400"
      : "border-red-500/50 bg-red-500/10 text-red-400";

  return (
    <div className="min-h-screen bg-[#0d1117] text-white pt-24 pb-16 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />
      
      <div className="mx-auto max-w-2xl px-6 relative z-10">
        {/* Header */}
        <div className="mb-10 text-center">
          <img
            src={p.image || "https://placehold.co/128x128"}
            alt="avatar"
            className="h-32 w-32 rounded-full object-cover ring-2 ring-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.3)] mx-auto mb-6"
          />
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent mb-2">
            {p.name ?? "Your Profile"}
          </h1>
          <div className="text-gray-400 font-mono text-sm">{p.email}</div>
        </div>

        {/* Card */}
        <div className="rounded-3xl border border-gray-800 bg-[#161b22] shadow-2xl overflow-hidden relative group">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl group-hover:bg-blue-600/20 transition-all duration-500"></div>
          
          <div className="p-8 relative z-10 space-y-6">
            {/* Picture Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Profile Picture</label>
              <label className="cursor-pointer">
                <div className="w-full rounded-xl border-2 border-dashed border-gray-700 bg-[#0d1117] px-6 py-4
                  text-center text-gray-400 hover:border-blue-500/50 hover:bg-[#0d1117]/80 transition-all">
                  <div className="text-sm font-medium">Click to upload image</div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={onFile}
                  className="hidden"
                />
              </label>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Name</label>
              <input
                className="w-full rounded-xl border border-gray-700 bg-[#0d1117] px-4 py-3
                  text-white placeholder:text-gray-600
                  focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20
                  outline-none transition"
                placeholder="Your name"
                value={p.name ?? ""}
                onChange={(e) =>
                  setProfile((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                }
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Bio</label>
              <textarea
                className="w-full min-h-32 rounded-xl border border-gray-700 bg-[#0d1117] px-4 py-3
                  text-white placeholder:text-gray-600
                  focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20
                  outline-none transition resize-y"
                placeholder="Tell us about yourself"
                value={p.bio ?? ""}
                onChange={(e) =>
                  setProfile((prev) => (prev ? { ...prev, bio: e.target.value } : prev))
                }
              />
            </div>

            {/* Public toggle */}
            <div className="flex items-center justify-between rounded-xl border border-gray-700 bg-[#0d1117] px-5 py-4">
              <span className="text-sm font-medium text-gray-200">Public Profile</span>
              <button
                type="button"
                onClick={() =>
                  setProfile((prev) => (prev ? { ...prev, is_public: !prev.is_public } : prev))
                }
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition shadow-inner ${
                  p.is_public ? "bg-blue-600" : "bg-gray-700"
                }`}
                aria-pressed={p.is_public}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition shadow-md ${
                    p.is_public ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Save */}
            <button
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl bg-blue-600 py-4 font-bold text-lg
                hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed
                shadow-[0_10px_30px_rgba(59,130,246,0.4)]
                transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>

            {msg && <div className={`rounded-xl border-2 px-4 py-3 text-sm font-medium text-center ${msgClass}`}>{msg}</div>}
          </div>

          {/* Public link */}
          <div className="border-t border-gray-800 bg-[#0d1117]/50 px-8 py-6">
            <div className="flex items-center justify-between gap-4">
              <span className="font-mono text-sm text-blue-400">/u/{p.id}</span>
              <button
                type="button"
                onClick={async () => {
                  const path = `/u/${p.id}`;
                  try {
                    await navigator.clipboard.writeText(path);
                    setMsg("Copied!");
                    setTimeout(() => setMsg(""), 1200);
                  } catch {
                    setMsg("Copy failed");
                  }
                }}
                className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2 text-sm font-semibold
                  text-gray-300 hover:bg-gray-700/50 hover:border-gray-600 transition-all"
              >
                Copy Link
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}