

# Fix "Untitled Exam" - Debug and Resolve Exam Titles

## Problem
All 17 exam results in the database have `exam_title = "Untitled Exam"`. This means both data sources for titles are failing:
1. The `/v2/courses/{courseId}/content` endpoint either returns data in an unexpected format (so `unitTitleMap` stays empty)
2. The grades response doesn't include `learningUnit.title` data

## Approach (Two Phases)

### Phase 1: Add Debug Logging
Add detailed logging to `supabase/functions/sync-learnworlds/index.ts` to capture the raw API response structure from both endpoints:
- Log the first raw response from `/v2/courses/{courseId}/content` (keys, structure, first item)
- Log the first raw grade entry from `/v2/courses/{courseId}/grades` (all keys, especially `learningUnit`)
- Log the `unitTitleMap` size after processing

This will tell us exactly what fields the LearnWorlds API returns.

### Phase 2: Fix Parsing
Based on the debug logs, adjust the parsing logic in `fetchCourseContent()` and `processGrades()` to correctly extract exam titles from the actual API response format.

## Technical Details

### File: `supabase/functions/sync-learnworlds/index.ts`

**In `fetchCourseContent()`** (around line 218):
- After receiving the response, log `JSON.stringify(Object.keys(data))` and `JSON.stringify(data).substring(0, 1000)` to see the actual structure

**In `fetchCourseGrades()`** (around line 282):
- After receiving grades, log the first grade entry's full structure: `JSON.stringify(grades[0]).substring(0, 500)`

**In `processGrades()`** (around line 369):
- Log whether `grade.learningUnit` exists and what keys it has

After deploying and running a sync, we check the logs to see the actual API response format, then fix the title extraction in a follow-up step.

