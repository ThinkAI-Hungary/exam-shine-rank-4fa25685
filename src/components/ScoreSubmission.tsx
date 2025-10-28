import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { PlusCircle } from "lucide-react";

interface Exam {
  id: string;
  name: string;
  max_score: number;
}

interface ScoreSubmissionProps {
  exams: Exam[];
  userId: string;
  onScoreSubmitted: () => void;
}

const ScoreSubmission = ({ exams, userId, onScoreSubmitted }: ScoreSubmissionProps) => {
  const [selectedExam, setSelectedExam] = useState<string>("");
  const [score, setScore] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam || !score) return;

    const exam = exams.find(e => e.id === selectedExam);
    const scoreValue = parseInt(score);

    if (!exam || scoreValue < 0 || scoreValue > exam.max_score) {
      toast.error(`Score must be between 0 and ${exam?.max_score || 100}`);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("scores")
        .upsert({
          user_id: userId,
          exam_id: selectedExam,
          score: scoreValue,
        });

      if (error) throw error;

      toast.success("Score submitted successfully!");
      setScore("");
      setSelectedExam("");
      onScoreSubmitted();
    } catch (error: any) {
      toast.error(error.message || "Failed to submit score");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-primary" />
          Submit Score
        </CardTitle>
        <CardDescription>Record your exam score</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="exam">Exam</Label>
            <Select value={selectedExam} onValueChange={setSelectedExam}>
              <SelectTrigger id="exam">
                <SelectValue placeholder="Select an exam" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id}>
                    {exam.name} (Max: {exam.max_score})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="score">Score</Label>
            <Input
              id="score"
              type="number"
              placeholder="Enter your score"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              min={0}
              max={exams.find(e => e.id === selectedExam)?.max_score || 100}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !selectedExam}>
            {loading ? "Submitting..." : "Submit Score"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ScoreSubmission;
