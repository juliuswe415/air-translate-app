'use client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWebRTC } from '@/hooks/useWebRTC';
import { PauseIcon, PlayIcon } from '@phosphor-icons/react/dist/ssr';
import { ReactNode, useMemo, useState } from 'react';

export const Room = ({
  id,
  defaultLanguage,
}: {
  id: string;
  defaultLanguage: string;
}): ReactNode => {
  const [language, setLanguage] = useState(defaultLanguage);

  const { onToggleMic, micEnabled, captions, debugLogs } =
    useWebRTC(id, language);

  const debugText = useMemo(() => {
    return debugLogs
      .map((item) => `[${item.time}] ${item.message}`)
      .join('\n');
  }, [debugLogs]);

  const downloadDebugLogs = (): void => {
    const blob = new Blob([debugText], {
      type: 'text/plain;charset=utf-8',
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url;
    a.download = `air-translate-debug-${Date.now()}.txt`;

    document.body.appendChild(a);

    a.click();

    a.remove();

    URL.revokeObjectURL(url);
  };

  return (
    <div className='flex flex-col items-center gap-6 w-full'>
      <div className='text-2xl font-semibold'>{id}</div>

      <input
        id='mic'
        type='hidden'
        value={micEnabled ? '1' : '0'}
        readOnly
      />

      <Button
        onClick={onToggleMic}
        className='rounded-full size-40'
      >
        {micEnabled ? (
          <PauseIcon className='size-20' />
        ) : (
          <PlayIcon className='size-20' />
        )}
      </Button>

      <div className='w-full max-w-xs'>
        <div className='mb-2'>Translate to</div>

        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className='w-full'>
            <SelectValue placeholder='Language' />
          </SelectTrigger>

          <SelectContent>
            <SelectGroup>
              <SelectLabel>Language</SelectLabel>

              <SelectItem value='eng'>English</SelectItem>
              <SelectItem value='spa'>Spanish</SelectItem>
              <SelectItem value='fra'>French</SelectItem>
              <SelectItem value='deu'>German</SelectItem>
              <SelectItem value='ita'>Italian</SelectItem>
              <SelectItem value='por'>Portuguese</SelectItem>
              <SelectItem value='rus'>Russian</SelectItem>
              <SelectItem value='jpn'>Japanese</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className='w-full max-w-md text-right text-xs'>
        <button
          onClick={downloadDebugLogs}
          className='underline opacity-70 hover:opacity-100'
        >
          Download debug log
        </button>
      </div>

      <div className='w-full max-w-md rounded-xl border p-3 text-xs bg-slate-50 dark:bg-slate-900'>
        <div className='font-semibold mb-2'>Debug</div>

        <div className='max-h-64 overflow-auto flex flex-col gap-1'>
          {debugLogs.map((item, index) => (
            <div key={index}>
              <span className='opacity-60'>
                {item.time}
              </span>{' '}
              {item.message}
            </div>
          ))}
        </div>
      </div>

      <div className='w-full max-w-md flex flex-col gap-2'>
        {captions.map((item, index) => (
          <div
            key={index}
            className='rounded-lg border p-2 text-sm'
          >
            {item?.text}
          </div>
        ))}
      </div>
    </div>
  );
};
