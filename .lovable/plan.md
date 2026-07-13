## Problem

`VoiceSourceRecorder.tsx` reads `res.recording.status` and `res.recording.rejection_reason`, but the generated Supabase types don't include the `voice_source_recordings` table right now, so the inferred return type of `uploadVoiceSourceRecording` doesn't expose those fields — TypeScript errors on both accesses.

## Fix (frontend only — no server logic changes)

In `src/lib/voice-sources.functions.ts`:
- Add a small exported type describing the recording shape the component consumes:
  ```ts
  export type VoiceSourceRecordingResult = {
    id: string;
    status: "validated" | "rejected" | "cloned" | string;
    rejection_reason: string | null;
  };
  ```
- Give the two return paths in `uploadVoiceSourceRecording` (corrupted-WAV branch and normal branch) an explicit return annotation `Promise<{ recording: VoiceSourceRecordingResult }>` (casting the `row` through `as unknown as VoiceSourceRecordingResult`) so the client sees a stable shape regardless of stale generated types.

In `src/components/twinly/VoiceSourceRecorder.tsx`:
- Add a defensive type guard when reading the response, so the UI degrades gracefully if the shape is ever missing:
  ```ts
  const rec = res.recording;
  if (rec && rec.status === "rejected") {
    toast.error(`Rejected: ${rec.rejection_reason ?? "Recording did not pass validation."}`);
  } else {
    toast.success("Recording validated and ready for voice cloning");
  }
  ```

No database, RLS, or server-behavior changes. Scope is purely typing + a null-safe read in the component.
