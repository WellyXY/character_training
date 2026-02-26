import { useState } from "react";
import { Btn, Badge, I, ParrotLogo } from "./shared";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const [signup, setSignup] = useState(false);
  const [signupStep, setSignupStep] = useState(0);
  const [plan, setPlan] = useState("pro");
  const [showPw, setShowPw] = useState(false);

  const doLogin = () => {
    setErr(false); setLoading(true);
    setTimeout(() => { setLoading(false); if (email && pw) onLogin(); else setErr(true); }, 1000);
  };
  const doSignup = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(); }, 1000);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Left branding */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden items-center justify-center" style={{ background: "linear-gradient(135deg, #0F0F0F 0%, #1a1408 100%)" }}>
        <div className="absolute inset-0 opacity-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-amber-500" style={{ width: 200 + i * 80, height: 200 + i * 80, top: `${20 + i * 10}%`, left: `${10 + i * 8}%` }} />
          ))}
        </div>
        <div className="relative z-10 text-center max-w-sm">
          <div className="flex items-center gap-3 justify-center mb-6">
            <ParrotLogo sz={32} />
            <span className="text-2xl font-bold">Parrot <span className="text-amber-500">Studios</span></span>
          </div>
          <p className="text-gray-400 text-lg leading-relaxed">
            Create stunning AI-powered content with your digital character
          </p>
          <div className="flex gap-4 mt-10 justify-center">
            {["📸 Photos", "🎬 Videos", "🗣️ Lip Sync"].map(f => (
              <div key={f} className="px-4 py-2.5 rounded-lg text-gray-400 text-sm font-medium" style={{ background: "#242424" }}>{f}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm w-full">
          <div className="lg:hidden mb-6 flex items-center gap-2">
            <ParrotLogo sz={28} />
            <span className="font-bold">Parrot Studios</span>
          </div>

          {!signup ? (
            <>
              <h1 className="text-2xl font-bold mb-1">Welcome Back</h1>
              <p className="text-gray-400 text-sm mb-6">Sign in to your account</p>

              <button onClick={doLogin} className="w-full py-3 rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-700 flex items-center justify-center gap-3 text-sm font-medium mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                Continue with Google
              </button>
              <div className="flex items-center gap-3 my-4"><div className="flex-1 h-px bg-gray-800" /><span className="text-gray-600 text-xs">or</span><div className="flex-1 h-px bg-gray-800" /></div>

              <div className="space-y-3 mb-4">
                <div><label className="text-xs text-gray-400 block mb-1.5">Email</label>
                  <input className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="you@email.com" value={email} onChange={e => { setEmail(e.target.value); setErr(false); }} /></div>
                <div><label className="text-xs text-gray-400 block mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 pr-10" placeholder="••••••••" value={pw} onChange={e => { setPw(e.target.value); setErr(false); }} />
                    <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"><I n="eye" s={16} /></button>
                  </div>
                </div>
              </div>

              {err && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-3 flex items-center gap-2 text-red-400 text-xs"><I n="x" s={14} /> Please enter your email and password</div>}

              <div className="flex items-center justify-between mb-4">
                <label className="flex items-center gap-2 cursor-pointer"><div className="w-4 h-4 rounded border border-gray-600 bg-gray-800" /><span className="text-xs text-gray-400">Remember me</span></label>
                <button className="text-xs text-amber-400 hover:text-amber-300">Forgot password?</button>
              </div>

              <button onClick={doLogin} disabled={loading} className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-400 to-orange-500 text-black flex items-center justify-center gap-2">
                {loading ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full" style={{ animation: "spin 1s linear infinite" }} /> : "Sign In"}
              </button>
              <p className="text-center text-sm text-gray-500 mt-4">Don't have an account? <button onClick={() => setSignup(true)} className="text-amber-400 hover:text-amber-300 font-medium">Sign Up</button></p>
            </>
          ) : (
            <>
              {signupStep === 0 ? (
                <>
                  <h1 className="text-2xl font-bold mb-1">Create Your Account</h1>
                  <p className="text-gray-400 text-sm mb-6">Choose your plan to get started</p>
                  <div className="space-y-3 mb-6">
                    {[
                      { id: "free", l: "Free", d: "50 credits, 1 character, basic features", p: "$0", c: "green", b: "Get Started" },
                      { id: "pro", l: "Pro", d: "Unlimited characters, all creation features", p: "$9.99/mo", c: "amber", b: "Most Popular" },
                      { id: "business", l: "Business", d: "Multi-seat, shared gallery, analytics, brand templates", p: "$29.99/seat", c: "purple", b: "Teams" },
                    ].map(o => (
                      <button key={o.id} onClick={() => setPlan(o.id)} className={`w-full p-4 rounded-xl border-2 text-left transition-all ${plan === o.id ? `border-${o.c}-500 bg-${o.c}-500/5` : "border-gray-700 hover:border-gray-500"}`}>
                        <div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2"><span className="font-semibold">{o.l}</span><Badge color={o.c}>{o.b}</Badge></div><span className={`text-${o.c}-400 text-sm font-medium`}>{o.p}</span></div>
                        <p className="text-xs text-gray-400">{o.d}</p>
                      </button>
                    ))}
                  </div>
                  <Btn primary className="w-full" onClick={() => setSignupStep(1)}>Continue <I n="arrowR" s={16} /></Btn>
                  <p className="text-center text-sm text-gray-500 mt-4">Have an account? <button onClick={() => setSignup(false)} className="text-amber-400 font-medium">Sign In</button></p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold mb-1">{plan === "free" ? "Free" : plan === "pro" ? "Pro" : "Business"} Account</h1>
                  <p className="text-gray-400 text-sm mb-6">{plan === "free" ? "No credit card required — start creating for free" : "Fill in your details"}</p>
                  <div className="space-y-3 mb-4">
                    <div><label className="text-xs text-gray-400 block mb-1.5">{plan === "business" ? "Company / Studio Name" : "Full Name"}</label><input className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500" placeholder={plan === "business" ? "Acme Studios" : "Your name"} /></div>
                    <div><label className="text-xs text-gray-400 block mb-1.5">Email</label><input className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="you@email.com" /></div>
                    <div><label className="text-xs text-gray-400 block mb-1.5">Password</label><input type="password" className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="Min 8 characters" /></div>
                    {plan === "business" && <div><label className="text-xs text-gray-400 block mb-1.5">Team size</label><div className="flex gap-2">{["1-5", "6-15", "16-50", "50+"].map(n => <button key={n} className="flex-1 py-2 rounded-lg text-xs bg-gray-800 border border-gray-700 text-gray-400 hover:border-amber-500">{n}</button>)}</div></div>}
                  </div>
                  <button onClick={doSignup} disabled={loading} className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-amber-400 to-orange-500 text-black flex items-center justify-center gap-2">
                    {loading ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full" style={{ animation: "spin 1s linear infinite" }} /> : <>Create Account <I n="arrowR" s={16} /></>}
                  </button>
                  <button onClick={() => setSignupStep(0)} className="text-gray-500 text-xs mt-3 hover:text-gray-300 block mx-auto">← Back to plan selection</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
