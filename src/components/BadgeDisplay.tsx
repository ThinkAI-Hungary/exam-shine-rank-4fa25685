import { useState } from "react";
import { Medal, Award, Trophy, Star, Rocket, Target, Zap, Crown, TrendingUp, Sparkles, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);

  // Maps badge metadata to the correct SVG icon path in /badges/
  const resolveBadgeSvg = (badge: BadgeData['badge_definitions']): string | null => {
    const { badge_type, badge_level, badge_name } = badge;
    const nameLower = (badge_name || '').toLowerCase();

    // Category badges: Bronze, Silver, Gold
    if (badge_type === 'category') {
      if (badge_level === 'bronze') return '/badges/!jovo_bronzja2_jelveny.svg';
      if (badge_level === 'silver') return '/badges/!jovo_ezustje_svg.svg';
      if (badge_level === 'gold') return '/badges/!jovo_aranya_jelveny.svg';
    }

    // Aspirant badges
    if (badge_type === 'aspirant') {
      if (badge_level === 'bronze') return '/badges/!jovo_bronzja2_jelveny.svg';
      if (badge_level === 'silver') return '/badges/!jovo_ezustje_svg.svg';
      if (badge_level === 'gold') return '/badges/!jovo_aranya_jelveny.svg';
    }

    // Monthly star badges - match by name
    if (badge_type === 'monthly_star') {
      if (nameLower.includes('vizsga') || nameLower.includes('exam') || nameLower.includes('mester'))
        return '/badges/!honap_vizsga_mester_final.svg';
      if (nameLower.includes('képzési') || nameLower.includes('training') || nameLower.includes('bajnok'))
        return '/badges/!kepzesi_bajnok.svg';
      if (nameLower.includes('kezdő') || nameLower.includes('starter') || nameLower.includes('siker') || nameLower.includes('success'))
        return '/badges/!kezdo_siker.svg';
    }

    return null;
  };

  // Returns the effective SVG path for a badge: prefers icon_name if it's already an SVG path,
  // otherwise falls back to the resolved SVG based on badge metadata
  const getEffectiveSvgPath = (badge: BadgeData['badge_definitions']): string | null => {
    if (badge.icon_name.startsWith('/')) return badge.icon_name;
    return resolveBadgeSvg(badge);
  };

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

  // Renders either an SVG image or a Lucide icon based on icon_name
  const BadgeIcon = ({ badge, className = "w-5 h-5", svgClassName }: { badge: BadgeData['badge_definitions']; className?: string; svgClassName?: string }) => {
    const svgPath = getEffectiveSvgPath(badge);
    if (svgPath) {
      return <img src={svgPath} alt="" className={svgClassName || className} style={{ objectFit: "contain" }} />;
    }
    const Icon = getIcon(badge.icon_name);
    return <Icon className={className} />;
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

    const isMonthly = primaryBadge.badge_definitions.badge_type === 'monthly_star';
    const isCategory = primaryBadge.badge_definitions.badge_type === 'category';
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant={isCategory ? "default" : "secondary"}
              className="flex items-center gap-1.5 font-medium"
              style={{
                backgroundColor: isCategory 
                  ? primaryBadge.badge_definitions.color
                  : isMonthly
                  ? primaryBadge.badge_definitions.color
                  : `${primaryBadge.badge_definitions.color}30`,
                borderColor: primaryBadge.badge_definitions.color,
                color: isCategory ? '#000' : isMonthly ? '#fff' : primaryBadge.badge_definitions.color,
                padding: '0.125rem 0.5rem'
              }}
            >
              <BadgeIcon badge={primaryBadge.badge_definitions} className="w-4 h-4 flex-shrink-0" svgClassName="w-6 h-6 flex-shrink-0" />
              <span className="text-xs font-semibold whitespace-nowrap leading-tight">
                {primaryBadge.badge_definitions.badge_name}
              </span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{primaryBadge.badge_definitions.badge_name}</p>
            <p className="text-xs text-muted-foreground">{primaryBadge.badge_definitions.description}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Odaítélve: {new Date(primaryBadge.awarded_at).toLocaleDateString()}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="space-y-6">
      {categoryBadges.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Kategória</h3>
          <div className="flex flex-wrap gap-3">
            {categoryBadges.map(badge => {
              const svgPath = getEffectiveSvgPath(badge.badge_definitions);
              return (
                <TooltipProvider key={badge.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-transform hover:scale-105 text-left" role="button" tabIndex={0} onClick={() => setSelectedBadge(badge)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBadge(badge); } }}
                        style={{ 
                          backgroundColor: `${badge.badge_definitions.color}12`,
                          border: `1.5px solid ${badge.badge_definitions.color}40`,
                        }}
                      >
                        {svgPath ? (
                          <img src={svgPath} alt={badge.badge_definitions.badge_name} className="w-16 h-16" style={{ objectFit: "contain" }} />
                        ) : (
                          <BadgeIcon badge={badge.badge_definitions} className="w-8 h-8" />
                        )}
                        <span className="text-xs font-semibold text-center" style={{ color: badge.badge_definitions.color }}>{badge.badge_definitions.badge_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(badge.awarded_at).toLocaleDateString('hu-HU')}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{badge.badge_definitions.badge_name}</p>
                      <p className="text-xs text-muted-foreground">{badge.badge_definitions.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Odaítélve: {new Date(badge.awarded_at).toLocaleDateString()}
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
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Törekvő</h3>
          <div className="flex flex-wrap gap-3">
            {aspirantBadges.map(badge => {
              const svgPath = getEffectiveSvgPath(badge.badge_definitions);
              return (
                <TooltipProvider key={badge.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-transform hover:scale-105 text-left" role="button" tabIndex={0} onClick={() => setSelectedBadge(badge)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBadge(badge); } }}
                        style={{ 
                          backgroundColor: `${badge.badge_definitions.color}08`,
                          border: `1.5px dashed ${badge.badge_definitions.color}50`,
                        }}
                      >
                        {svgPath ? (
                          <img src={svgPath} alt={badge.badge_definitions.badge_name} className="w-14 h-14" style={{ objectFit: "contain" }} />
                        ) : (
                          <BadgeIcon badge={badge.badge_definitions} className="w-7 h-7" />
                        )}
                        <span className="text-xs font-medium text-center" style={{ color: badge.badge_definitions.color }}>{badge.badge_definitions.badge_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(badge.awarded_at).toLocaleDateString('hu-HU')}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{badge.badge_definitions.badge_name}</p>
                      <p className="text-xs text-muted-foreground">{badge.badge_definitions.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Odaítélve: {new Date(badge.awarded_at).toLocaleDateString()}
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
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Havi csillagok</h3>
          <div className="flex flex-wrap gap-3">
            {monthlyBadges.map(badge => {
              const svgPath = getEffectiveSvgPath(badge.badge_definitions);
              const isExpiring = badge.expires_at && new Date(badge.expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
              return (
                <TooltipProvider key={badge.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-transform hover:scale-105 text-left ${isExpiring ? 'opacity-70' : ''}`} role="button" tabIndex={0} onClick={() => setSelectedBadge(badge)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBadge(badge); } }}
                        style={{ 
                          backgroundColor: `${badge.badge_definitions.color}15`,
                          border: `1.5px solid ${badge.badge_definitions.color}40`,
                        }}
                      >
                        {svgPath ? (
                          <img src={svgPath} alt={badge.badge_definitions.badge_name} className="w-14 h-14" style={{ objectFit: "contain" }} />
                        ) : (
                          <BadgeIcon badge={badge.badge_definitions} className="w-7 h-7" />
                        )}
                        <span className="text-xs font-semibold text-center" style={{ color: badge.badge_definitions.color }}>{badge.badge_definitions.badge_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(badge.awarded_at).toLocaleDateString('hu-HU')}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{badge.badge_definitions.badge_name}</p>
                      <p className="text-xs text-muted-foreground">{badge.badge_definitions.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Odaítélve: {new Date(badge.awarded_at).toLocaleDateString()}
                      </p>
                      {badge.expires_at && (
                        <p className="text-xs text-muted-foreground">
                          Lejár: {new Date(badge.expires_at).toLocaleDateString()}
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
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Előrehaladás</h3>
          <div className="flex flex-wrap gap-3">
            {progressBadges.map(badge => {
              const svgPath = getEffectiveSvgPath(badge.badge_definitions);
              return (
                <TooltipProvider key={badge.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-transform hover:scale-105 text-left" role="button" tabIndex={0} onClick={() => setSelectedBadge(badge)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBadge(badge); } }}
                        style={{ 
                          backgroundColor: `${badge.badge_definitions.color}12`,
                          border: `1.5px solid ${badge.badge_definitions.color}30`,
                        }}
                      >
                        {svgPath ? (
                          <img src={svgPath} alt={badge.badge_definitions.badge_name} className="w-14 h-14" style={{ objectFit: "contain" }} />
                        ) : (
                          <BadgeIcon badge={badge.badge_definitions} className="w-7 h-7" />
                        )}
                        <span className="text-xs font-medium text-center" style={{ color: badge.badge_definitions.color }}>{badge.badge_definitions.badge_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(badge.awarded_at).toLocaleDateString('hu-HU')}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{badge.badge_definitions.badge_name}</p>
                      <p className="text-xs text-muted-foreground">{badge.badge_definitions.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Odaítélve: {new Date(badge.awarded_at).toLocaleDateString()}
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
          <p className="text-sm">Még nincs megszerzett jelvény</p>
        </div>
      )}
    </div>
  );
};

export default BadgeDisplay;
