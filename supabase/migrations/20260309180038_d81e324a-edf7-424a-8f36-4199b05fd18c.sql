INSERT INTO exam_results (user_id, username, course_id, course_title, exam_id, exam_title, score, completed_at)
VALUES ('test_debug_user', 'Debug Test', 'test_course', 'Test Course', 'test_exam_123', 'Test Exam', 50, '2026-01-01T00:00:00Z')
ON CONFLICT (user_id, exam_id) DO UPDATE SET score = EXCLUDED.score;