import { useState } from "react";
import LoginScreen from "./LoginScreen";
import OnboardingFlow from "./OnboardingFlow";
import StudioApp from "./StudioApp";
import AdminApp from "./AdminApp";

export default function App() {
  const [screen, setScreen] = useState("login");
  const [isAdmin] = useState(true);
  const [userPlan] = useState("pro");

  return (
    <div style={{ fontFamily: "system-ui" }}>
      {screen === "login" && <LoginScreen onLogin={() => setScreen("onboarding")} />}
      {screen === "onboarding" && <OnboardingFlow onComplete={() => setScreen("studio")} onSkip={() => setScreen("studio")} />}
      {screen === "studio" && <StudioApp isAdmin={isAdmin} plan={userPlan} onAdmin={() => setScreen("admin")} onNewCharacter={() => setScreen("onboarding")} onLogout={() => setScreen("login")} />}
      {screen === "admin" && <AdminApp onCreator={() => setScreen("studio")} onLogout={() => setScreen("login")} />}
    </div>
  );
}
