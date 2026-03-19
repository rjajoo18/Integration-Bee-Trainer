"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Profile = {
  id: number;
  name: string | null;
  email: string | null;
  image: string | null;
  username: string | null;
  elo_rating: number | null;
  rated_battles: number | null;
  rated_wins: number | null;
  rated_losses: number | null;
};

export default function ProfilePage() {
  const { data: session, status, update } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    if (status !== "authenticated") return;

    // Fetch profile data
    fetch("/api/profile")
      .then((r) => {
        if (!r.ok) throw new Error("Load failed");
        return r.json();
      })
      .then(setProfile)
      .catch((err) => {
        console.error(err);
        setMsg("Failed to load profile");
      });
  }, [status]);

  if (status === "loading") return <div className="p-6 text-white">Loading…</div>;
  if (status === "unauthenticated") return <div className="p-6 text-white">Please sign in.</div>;
  if (!profile) return <div className="p-6 text-white">Loading profile…</div>;

  const p = profile;

  async function save() {
    setSaving(true);
    setMsg("");

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          image: p.image,
          username: p.username || undefined,
        }),
      });

      const data = await res.json();
      setSaving(false);

      if (!res.ok) {
        setMsg(data.error || "Save failed");
        return;
      }

      setProfile(data);

      // Update session so Navbar reflects changes immediately
      await update({
        ...session,
        user: {
          ...session?.user,
          name: data.name,
          image: data.image,
          username: data.username,
        },
      });

      setMsg("Saved!");
      setTimeout(() => setMsg(""), 1500);
    } catch (err) {
      setSaving(false);
      setMsg("Connection error");
    }
  }

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 128;
          const MAX_HEIGHT = 128;

          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
      };
    });
  };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const smallImage = await resizeImage(file);
      setProfile((prev) => (prev ? { ...prev, image: smallImage } : prev));
    } catch (err) {
      setMsg("Failed to process image");
    }
  }

  const msgClass =
    msg && msg.toLowerCase().includes("saved")
      ? "border-green-500/50 bg-green-500/10 text-green-400"
      : "border-red-500/50 bg-red-500/10 text-red-400";

  const elo = p.elo_rating ?? 1200;
  const battles = p.rated_battles ?? 0;
  const wins = p.rated_wins ?? 0;
  const losses = p.rated_losses ?? 0;

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
            {p.name ?? p.username ?? "Your Profile"}
          </h1>
          {p.username && (
            <div className="text-indigo-400 font-mono text-sm mb-1">@{p.username}</div>
          )}
          <div className="text-gray-400 font-mono text-sm mb-5">{p.email}</div>

          {/* Elo stat block */}
          <div className="inline-flex items-center gap-6 rounded-xl border border-white/[0.08] bg-white/[0.03] px-6 py-3">
            <div className="text-center">
              <div className="text-2xl font-black font-mono text-indigo-300">{elo}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mt-0.5">Elo Rating</div>
            </div>
            <div className="w-px h-8 bg-white/[0.08]" />
            <div className="text-center">
              <div className="text-lg font-bold text-zinc-200">{battles}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mt-0.5">Battles</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-400">{wins}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mt-0.5">Wins</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">{losses}</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mt-0.5">Losses</div>
            </div>
          </div>
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
                  <div className="text-sm font-medium">Click to upload new image</div>
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

            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Username{" "}
                <span className="text-gray-600 font-normal text-xs">— shown in battles</span>
              </label>
              <input
                className="w-full rounded-xl border border-gray-700 bg-[#0d1117] px-4 py-3
                  text-white placeholder:text-gray-600 font-mono tracking-wide
                  focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20
                  outline-none transition"
                placeholder="your_username"
                value={p.username ?? ""}
                onChange={(e) =>
                  setProfile((prev) =>
                    prev
                      ? {
                          ...prev,
                          username: e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_]/g, "")
                            .slice(0, 20),
                        }
                      : prev,
                  )
                }
                maxLength={20}
                spellCheck={false}
                autoComplete="username"
              />
              {p.username !== null && p.username !== "" && p.username.length < 3 && (
                <p className="text-xs text-red-400 mt-1.5 pl-1">At least 3 characters required</p>
              )}
              {!p.username && (
                <p className="text-xs text-gray-600 mt-1.5 pl-1">
                  Set a username to be identified in battles
                </p>
              )}
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
