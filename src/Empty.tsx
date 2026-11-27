import type { ReactNode } from "react";
// ?raw puts each picture in the JS as SVG text, because the phone gets only the JS and the CSS of a new front end.
// The SVG goes in the page, not in an <img>, so that the CSS of the page can color the paths for the theme.
import agents from "./empty/agents.svg?raw";
import completed from "./empty/completed.svg?raw";
import closed from "./empty/closed.svg?raw";
import calls from "./empty/calls.svg?raw";

// The empty state of a list: the bird mascot of Yonder, a title and one line, in the center of the panel.
// Agents: the bird sleeps on a cloud. Completed: it jumps in confetti. Closed: its envelope is empty. Calls: it talks
// into a microphone. The pictures are SVG traces of the aviator bird.
const ART = { agents, completed, closed, calls };

export function Empty({ art, title, children }: { art?: keyof typeof ART; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {art && <div className="empty-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ART[art] }} />}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
