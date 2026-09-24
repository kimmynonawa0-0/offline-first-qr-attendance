import { useLocalSearchParams } from 'expo-router';
import AppScreen from '../AppScreen';

export default function ScreenRoute() {
  const { page, eventId, recordId } = useLocalSearchParams();
  return <AppScreen key={`${page}-${eventId || ''}-${recordId || ''}`} />;
}
