import { Medal, Award, Trophy, Star, Rocket, Target, Zap, Crown, TrendingUp, Sparkles, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface BadgeData {
  id: string;
  badge_definitions: {
    badge_name: string;
    badge_type: 'category' | 'monthly_star' | 'progress' | 'aspirant';
    badge_level: string | null;
    description: string;
    icon_name: string;
    color: string;
  };
  awarded_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

interface BadgeDisplayProps {
  badges: BadgeData[];
  compact?: boolean;
  showExpired?: boolean;
}

const BadgeDisplay = ({ badges, compact = false, showExpired = false }: BadgeDisplayProps) => {
  const getIcon = (iconName: string) => {
    const iconMap: Record<string, any> = {
      Medal,
      Award,
      Trophy,
      Star,
      Rocket,
      Target,
      Zap,
      Crown,
      TrendingUp,
      Sparkles,
      GraduationCap,
    };
    
    return iconMap[iconName] || Star;
  };

  const activeBadges = badges.filter(b => !b.revoked_at && (showExpired || !b.expires_at || new Date(b.expires_at) > new Date()));
  
  // Group badges by type
  const categoryBadges = activeBadges.filter(b => b.badge_definitions.badge_type === 'category');
  const aspirantBadges = activeBadges.filter(b => b.badge_definitions.badge_type === 'aspirant');
  const monthlyBadges = activeBadges.filter(b => b.badge_definitions.badge_type === 'monthly_star');
  const progressBadges = activeBadges.filter(b => b.badge_definitions.badge_type === 'progress');

  if (compact) {
    // Show primary badge: category > aspirant > monthly > progress
    const primaryBadge = categoryBadges[0] || aspirantBadges[0] || monthlyBadges[0] || progressBadges[0];
    if (!primaryBadge) return null;

    const Icon = getIcon(primaryBadge.badge_definitions.icon_name);
    const isMonthly = primaryBadge.badge_definitions.badge_type === 'monthly_star';
    const isCategory = primaryBadge.badge_definitions.badge_type === 'category';
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant={isCategory ? "default" : "secondary"}
              className="flex items-center gap-1.5 font-medium"
              style={
                isCategory ? {
                  backgroundColor: primaryBadge.badge_definitions.color,
                  borderColor: primaryBadge.badge_definitions.color,
                  color: '#000',
                  paddingLeft: '0.75rem',
                  paddingRight: '0.5rem',
                  paddingTop: '0.125rem',
                  paddingBottom: '0.125rem'
                } : isMonthly ? {
                  backgroundColor: primaryBadge.badge_definitions.color,
                  borderColor: primaryBadge.badge_definitions.color,
                  color: '#fff',
                  paddingLeft: '0.75rem',
                  paddingRight: '0.5rem',
                  paddingTop: '0.125rem',
                  paddingBottom: '0.125rem'
                } : {
                  backgroundColor: `${primaryBadge.badge_definitions.color}30`,
                  borderColor: primaryBadge.badge_definitions.color,
                  color: primaryBadge.badge_definitions.color,
                  paddingLeft: '0.75rem',
                  paddingRight: '0.5rem',
                  paddingTop: '0.125rem',
                  paddingBottom: '0.125rem'
                }
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-semibold whitespace-nowrap leading-tight">
                {primaryBadge.badge_definitions.badge_name}
              </span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{primaryBadge.badge_definitions.badge_name}</p>
            <p className="text-xs text-muted-foreground">{primaryBadge.badge_definitions.description}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Awarded: {new Date(primaryBadge.awarded_at).toLocaleDateString()}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-4">
      {categoryBadges.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Category</h3>
          <div className="flex flex-wrap gap-2">
            {categoryBadges.map(badge => {
              const Icon = getIcon(badge.badge_definitions.icon_name);
              return (
                <TooltipProvider key={badge.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge 
                        variant="secondary" 
                        className="flex items-center gap-2 py-2 px-3 cursor-help"
                        style={{ 
                          backgroundColor: `${badge.badge_definitions.color}20`,
                          borderColor: badge.badge_definitions.color,
                          color: badge.badge_definitions.color
                        }}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-semibold">{badge.badge_definitions.badge_name}</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{badge.badge_definitions.badge_name}</p>
                      <p className="text-xs text-muted-foreground">{badge.badge_definitions.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Awarded: {new Date(badge.awarded_at).toLocaleDateString()}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}

      {aspirantBadges.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Aspirant</h3>
          <div className="flex flex-wrap gap-2">
            {aspirantBadges.map(badge => {
              const Icon = getIcon(badge.badge_definitions.icon_name);
              return (
                <TooltipProvider key={badge.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge 
                        variant="outline" 
                        className="flex items-center gap-2 py-2 px-3 cursor-help"
                        style={{ 
                          borderColor: badge.badge_definitions.color,
                          color: badge.badge_definitions.color
                        }}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{badge.badge_definitions.badge_name}</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{badge.badge_definitions.badge_name}</p>
                      <p className="text-xs text-muted-foreground">{badge.badge_definitions.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Awarded: {new Date(badge.awarded_at).toLocaleDateString()}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}

      {monthlyBadges.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Monthly Stars</h3>
          <div className="flex flex-wrap gap-2">
            {monthlyBadges.map(badge => {
              const Icon = getIcon(badge.badge_definitions.icon_name);
              const isExpiring = badge.expires_at && new Date(badge.expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
              return (
                <TooltipProvider key={badge.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge 
                        variant="default" 
                        className={`flex items-center gap-2 py-2 px-3 cursor-help ${isExpiring ? 'opacity-70' : ''}`}
                        style={{ 
                          backgroundColor: badge.badge_definitions.color,
                          borderColor: badge.badge_definitions.color
                        }}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{badge.badge_definitions.badge_name}</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{badge.badge_definitions.badge_name}</p>
                      <p className="text-xs text-muted-foreground">{badge.badge_definitions.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Awarded: {new Date(badge.awarded_at).toLocaleDateString()}
                      </p>
                      {badge.expires_at && (
                        <p className="text-xs text-muted-foreground">
                          Expires: {new Date(badge.expires_at).toLocaleDateString()}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}

      {progressBadges.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Progress</h3>
          <div className="flex flex-wrap gap-2">
            {progressBadges.map(badge => {
              const Icon = getIcon(badge.badge_definitions.icon_name);
              return (
                <TooltipProvider key={badge.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge 
                        variant="secondary" 
                        className="flex items-center gap-2 py-2 px-3 cursor-help"
                        style={{ 
                          backgroundColor: `${badge.badge_definitions.color}20`,
                          borderColor: badge.badge_definitions.color,
                          color: badge.badge_definitions.color
                        }}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{badge.badge_definitions.badge_name}</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{badge.badge_definitions.badge_name}</p>
                      <p className="text-xs text-muted-foreground">{badge.badge_definitions.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Awarded: {new Date(badge.awarded_at).toLocaleDateString()}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        </div>
      )}

      {activeBadges.length === 0 && (
        <div className="text-center text-muted-foreground py-4">
          <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No badges earned yet</p>
        </div>
      )}
    </div>
  );
};

export default BadgeDisplay;
