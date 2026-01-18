import Link from "next/link";

async function getData(id: string) {
  const res = await fetch(`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/users/${id}`, {
    cache: "no-store",
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

export default async function PublicUserPage({ params }: { params: { id: string } }) {
  const { ok, status, data } = await getData(params.id);

  if (!ok) {
    return (
      <div className="p-6">
        <div className="text-xl font-bold mb-2">Cannot view profile</div>
        <div className="text-gray-300">({status}) {data?.error ?? "Error"}</div>
        <div className="mt-4">
          <Link className="text-blue-400 underline" href="/auth">Go sign in</Link>
        </div>
      </div>
    );
  }

  const user = data.user;
  const solves = data.recentSolves as any[];

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <img
          src={user.image || "https://placehold.co/96x96"}
          alt="avatar"
          className="w-24 h-24 rounded-full object-cover border border-gray-700"
        />
        <div>
          <div className="text-3xl font-bold">{user.name ?? "Unnamed"}</div>
          {user.bio && <div className="text-gray-300 mt-2">{user.bio}</div>}
        </div>
      </div>

      <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6">
        <div className="text-xl font-bold mb-4">Recent Solves</div>
        {solves.length === 0 ? (
          <div className="text-gray-400">No recent activity.</div>
        ) : (
          <div className="space-y-3">
            {solves.map((s, i) => (
              <div key={i} className="flex justify-between border-b border-gray-800 pb-2">
                <div className="text-gray-200">
                  Problem <span className="font-mono">{s.problem_id}</span>
                  {s.source ? <span className="text-gray-500"> · {s.source}</span> : null}
                </div>
                <div className="text-gray-300">
                  {s.is_solved ? "✅ solved" : "❌ unsolved"} · {s.attempts} attempts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
