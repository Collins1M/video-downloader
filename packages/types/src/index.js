"use strict";
// Shared contracts between apps/web, apps/api, and apps/worker.
// Keep this package framework-agnostic (no Nest/Next imports).
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEO_PROCESSING_QUEUE = void 0;
// --- Queue contract (Phase 5) ---
// Shared between apps/api (producer) and apps/worker (consumer) so both
// sides agree on the queue name and job payload shape without either
// depending on the other's source.
exports.VIDEO_PROCESSING_QUEUE = "video-processing";
