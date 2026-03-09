ALTER TABLE exam_results DROP CONSTRAINT exam_results_user_exam_unique;
ALTER TABLE exam_results ADD CONSTRAINT exam_results_user_exam_unique UNIQUE (user_id, exam_id, completed_at);