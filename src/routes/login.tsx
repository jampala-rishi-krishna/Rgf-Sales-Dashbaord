import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/lib/brand";
import { LOGIN_EMAIL, LOGIN_PASSWORD, isLoggedIn, setLoggedIn } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Rare Global Food" },
      { name: "description", content: "Sales dashboard for Rare Global Food Trading Corp." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoggedIn()) navigate({ to: "/" });
  }, [navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim().toLowerCase() === LOGIN_EMAIL && password === LOGIN_PASSWORD) {
      setLoggedIn(true);
      navigate({ to: "/" });
    } else {
      setError("Invalid email or password.");
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left */}
      <div className="hidden md:flex md:w-1/2 relative items-center justify-center p-12" style={{ backgroundColor: "#86000B" }}>
        <div
          aria-hidden
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1600&q=80')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "multiply",
          }}
        />
        <div className="relative text-white max-w-lg">
          <div className="text-xs font-bold tracking-[0.3em] mb-6 opacity-90">PHILIPPINES NATIONWIDE</div>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
            Supplying food, meat &amp; seafood across The Philippines
          </h1>
          <p className="mt-6 text-base opacity-80 leading-relaxed">
            Delivering world-class quality, reliable logistics, and tailored solutions to a variety of industries nationwide.
          </p>
          <div className="mt-10 flex gap-6 text-sm font-semibold border-t border-white/20 pt-6">
            <div><div className="text-2xl font-black">2,000+</div><div className="opacity-80 font-normal">B2B Clients</div></div>
            <div><div className="text-2xl font-black">99%</div><div className="opacity-80 font-normal">Timely Delivery</div></div>
            <div><div className="text-2xl font-black">20K+ kg</div><div className="opacity-80 font-normal">Each Month</div></div>
          </div>
        </div>
      </div>

      {/* Right */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6" style={{ backgroundColor: "#FFEBCE" }}>
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 sm:p-8">
          <div className="flex justify-center mb-6"><Logo /></div>
          <h2 className="text-xl sm:text-2xl font-bold text-center" style={{ color: "#1B2419" }}>Welcome Back</h2>
          <p className="text-xs sm:text-sm text-center text-gray-500 mt-1">Sign in to your sales dashboard</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#1B2419" }}>Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2"
                style={{ outlineColor: "#86000B" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#1B2419" }}>Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full px-3 py-2.5 text-base sm:text-sm border border-gray-200 rounded-md focus:outline-none"
              />
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button
              type="submit"
              className="w-full py-2.5 min-h-[44px] rounded-md text-white font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#86000B" }}
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
