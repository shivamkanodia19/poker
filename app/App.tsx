import { useEffect, useState } from "react";
import { Home } from "./pages/Home";
import { SinglePlayer } from "./pages/SinglePlayer";
import { Multiplayer } from "./pages/Multiplayer";
import type { HomeChoice } from "./pages/Home";

type Route =
  | { name: "home" }
  | { name: "single"; displayName: string; buyIn: number; botCount: number }
  | { name: "multiplayer"; displayName: string; buyIn: number; mode: "create" | "join"; roomCode?: string };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h.startsWith("single")) {
    // Defaults — Home page normally sets state directly, but hash keeps refresh working.
    return { name: "single", displayName: "You", buyIn: 1000, botCount: 5 };
  }
  if (h.startsWith("multiplayer")) {
    return { name: "multiplayer", displayName: "You", buyIn: 1000, mode: "create" };
  }
  return { name: "home" };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goHome = () => {
    window.location.hash = "/";
    setRoute({ name: "home" });
  };

  const onStart = (choice: HomeChoice) => {
    if (choice.mode === "single") {
      window.location.hash = "/single";
      setRoute({
        name: "single",
        displayName: choice.displayName,
        buyIn: choice.buyIn,
        botCount: choice.botCount
      });
    } else {
      window.location.hash = "/multiplayer";
      setRoute({
        name: "multiplayer",
        displayName: choice.displayName,
        buyIn: choice.buyIn,
        mode: choice.mpMode,
        roomCode: choice.roomCode
      });
    }
  };

  return (
    <div className="app-shell">
      {route.name === "home" && <Home onStart={onStart} />}
      {route.name === "single" && (
        <SinglePlayer
          displayName={route.displayName}
          buyIn={route.buyIn}
          botCount={route.botCount}
          onExit={goHome}
        />
      )}
      {route.name === "multiplayer" && (
        <Multiplayer
          displayName={route.displayName}
          buyIn={route.buyIn}
          mode={route.mode}
          roomCode={route.roomCode}
          onExit={goHome}
        />
      )}
    </div>
  );
}
