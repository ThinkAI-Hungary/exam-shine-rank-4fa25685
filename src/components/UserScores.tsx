import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp } from "lucide-react";

interface Score {
  exam_name: string;
  score: number;
  max_score: number;
  submitted_at: string;
}

interface UserScoresProps {
  scores: Score[];
}

const UserScores = ({ scores }: UserScoresProps) => {
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const totalMaxScore = scores.reduce((sum, s) => sum + s.max_score, 0);
  const averagePercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Your Scores
        </CardTitle>
        <CardDescription>
          {scores.length > 0 
            ? `${scores.length} exam${scores.length > 1 ? 's' : ''} completed` 
            : 'No scores submitted yet'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {scores.length > 0 && (
          <div className="p-4 bg-gradient-to-br from-primary/10 to-accent/10 rounded-lg border border-primary/20">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Overall Performance</span>
              <span className="text-2xl font-bold text-primary">
                {averagePercentage.toFixed(1)}%
              </span>
            </div>
            <Progress value={averagePercentage} className="h-2" />
          </div>
        )}

        <div className="space-y-3">
          {scores.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Submit your first score to see it here!
            </p>
          ) : (
            scores.map((score, index) => {
              const percentage = (score.score / score.max_score) * 100;
              return (
                <div key={index} className="p-4 border rounded-lg hover:border-primary/50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-medium">{score.exam_name}</h4>
                      <p className="text-xs text-muted-foreground">
                        {new Date(score.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">
                        {score.score}/{score.max_score}
                      </div>
                      <div className={`text-sm font-medium ${
                        percentage >= 80 ? 'text-success' : 
                        percentage >= 60 ? 'text-accent' : 
                        'text-muted-foreground'
                      }`}>
                        {percentage.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                  <Progress value={percentage} className="h-1.5" />
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default UserScores;
