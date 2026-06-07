import { Allotment } from "allotment";
import EditorGroup from "./EditorGroup.jsx";
import { useTabStore } from "../stores/tabStore.js";

// Hosts the editor groups side-by-side. Phase 1 supports up to two horizontally
// split groups; the model in tabStore generalises to more.
export default function EditorArea() {
  const groups = useTabStore((s) => s.groups);

  if (groups.length === 1) {
    return <EditorGroup group={groups[0]} />;
  }
  return (
    <Allotment>
      {groups.map((g) => (
        <Allotment.Pane key={g.id} minSize={240}>
          <EditorGroup group={g} />
        </Allotment.Pane>
      ))}
    </Allotment>
  );
}
