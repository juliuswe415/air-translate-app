'use client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { ReactNode, useState } from 'react';

export const Room = ({ id, defaultLanguage }: { id: string; defaultLanguage: string }): ReactNode => {
  const [room, setRoom] = useState<string>(id);
  const [language, setLanguage] = useState(defaultLanguage);

  const { onToggleMic, micEnabled, captions, debugLogs } = useWebRTC(room, language);

  const onRoom = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    const elem = document.getElementById('roomId') as HTMLInputElement;
    setRoom(elem.value);
  };

  return (
    <div className='w-full flex flex-col items-center gap-4'>
      {room === '' ? (
        <>
          <div className='grid w-full items-center gap-3'>
            <Label htmlFor='roomId'>Name</Label>
            <Input id='roomId' defaultValue={room} />
          </div>
          <div className='w-full'>
            <Button size='lg' onClick={onRoom}>
              Conectar
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>{room}</div>

          <div className='w-fit'>
            <input type='hidden' id='mic' value={micEnabled ? '1' : '0'} />
            <Button onClick={onToggleMic} size='lg' variant={micEnabled ? 'secondary' : 'default'}>
              {micEnabled ? <PauseIcon className='size-18 sm:size-20' /> : <PlayIcon className='size-18 sm:size-20' />}
            </Button>
          </div>

          <div className='w-full max-w-xs'>
            <div>Translate to</div>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className='w-full max-w-xs'>
                <SelectValue placeholder='Your language' />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Language</SelectLabel>
                  <SelectItem value='eng'>English</SelectItem>
                  <SelectItem value='spa'>Español</SelectItem>
                  <SelectItem value='fra'>French</SelectItem>
                  <SelectItem value='deu'>German</SelectItem>
                  <SelectItem value='ita'>Italian</SelectItem>
                  <SelectItem value='por'>Portuguese</SelectItem>
                  <SelectItem value='rus'>Russian</SelectItem>
                  <SelectItem value='ara'>Arabic</SelectItem>
                  <SelectItem value='hin'>Hindi</SelectItem>
                  <SelectItem value='zho'>Mandarin Chinese</SelectItem>
                  <SelectItem value='jpn'>Japanese</SelectItem>
                  <SelectItem value='kor'>Korean</SelectItem>
                  <SelectItem value='tur'>Turkish</SelectItem>
                  <SelectItem value='vie'>Vietnamese</SelectItem>
                  <SelectItem value='urd'>Urdu</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className='w-full max-w-xs mt-4 rounded-xl border p-3 text-xs bg-slate-50 dark:bg-slate-800'>
            <div className='font-semibold mb-2'>Debug</div>
            <div className='max-h-48 overflow-auto flex flex-col gap-1'>
              {debugLogs.map((item, index) => (
                <div key={index}>
                  <span className='opacity-60'>{item.time}</span> {item.message}
                </div>
              ))}
            </div>
          </div>

          <div className='w-full fixed bottom-0 flex flex-col items-center max-h-40 p-2 pb-3 overflow-auto bg-gradient-to-b from-white dark:from-black to-slate-200/70n dark:to-slate-900/70'>
            <div className='max-w-lg flex flex-col gap-3 items-center'>
              {captions.map((item, index) => (
                <div key={index} className='odd:font-semibold text-center'>
                  {item?.text}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
