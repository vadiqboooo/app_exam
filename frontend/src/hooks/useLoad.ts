import { useCallback, useEffect, useRef, useState } from 'react';

export function useLoad<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = await loader();
      if (generation.current === current) setData(result);
    } catch (e) {
      if (generation.current === current) setError((e as Error).message);
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [loader]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current++;
    };
  }, [refresh]);
  return { data, error, loading, refresh };
}
