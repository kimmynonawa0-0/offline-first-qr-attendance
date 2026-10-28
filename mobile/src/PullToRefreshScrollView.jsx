import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from './ui';

const WEB_PULL_THRESHOLD = 64;

export default function PullToRefreshScrollView({ enabled, refreshing, onRefresh, children, ...props }) {
  const scrollRef = useRef(null);
  const gesture = useRef(null);
  const latest = useRef({ enabled, refreshing, onRefresh });
  const [pullDistance, setPullDistance] = useState(0);

  useEffect(() => {
    latest.current = { enabled, refreshing, onRefresh };
  }, [enabled, refreshing, onRefresh]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return undefined;
    const node = scrollRef.current?.getScrollableNode?.();
    if (!node) return undefined;

    const start = event => {
      if (!latest.current.enabled || latest.current.refreshing || node.scrollTop > 0.5
        || event.touches.length !== 1
        || event.target.closest?.('button, input, textarea, select, [data-no-pull-refresh]')) {
        gesture.current = null;
        return;
      }
      const touch = event.touches[0];
      gesture.current = { x: touch.clientX, y: touch.clientY, armed: false };
    };

    const move = event => {
      const current = gesture.current;
      if (!current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaY = touch.clientY - current.y;
      const deltaX = touch.clientX - current.x;
      if (deltaY <= 0 || Math.abs(deltaX) > Math.max(8, deltaY * 0.75) || node.scrollTop > 0.5) {
        gesture.current = null;
        setPullDistance(0);
        return;
      }

      // The app owns its scroll container on web; contain the browser's page reload gesture.
      event.preventDefault();
      current.armed = deltaY >= WEB_PULL_THRESHOLD;
      setPullDistance(Math.min(deltaY, 88));
    };

    const finish = () => {
      const shouldRefresh = Boolean(gesture.current?.armed && latest.current.enabled && !latest.current.refreshing);
      gesture.current = null;
      setPullDistance(0);
      if (shouldRefresh) latest.current.onRefresh?.();
    };

    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', move, { passive: false });
    node.addEventListener('touchend', finish, { passive: true });
    node.addEventListener('touchcancel', finish, { passive: true });
    return () => {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', finish);
      node.removeEventListener('touchcancel', finish);
    };
  }, [enabled]);

  const webPullHeight = refreshing ? 48 : pullDistance;
  return <ScrollView
    ref={scrollRef}
    {...props}
    className={Platform.OS === 'web' && enabled ? 'app-pull-refresh-scroll' : undefined}
    refreshControl={Platform.OS !== 'web' && enabled
      ? <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={colors.yellow}
        title="Refreshing"
        titleColor={colors.muted}
        colors={[colors.yellow]}
        progressBackgroundColor={colors.panel}
      />
      : undefined}
  >
    {Platform.OS === 'web' && enabled && webPullHeight > 0 && <View style={[styles.webIndicator, { height: webPullHeight }]}>
      <ActivityIndicator color={colors.yellow} animating={refreshing || pullDistance >= WEB_PULL_THRESHOLD} />
      <Text style={styles.webIndicatorText}>{refreshing ? 'Refreshing…' : pullDistance >= WEB_PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}</Text>
    </View>}
    {children}
  </ScrollView>;
}

const styles = StyleSheet.create({
  webIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, overflow: 'hidden' },
  webIndicatorText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
