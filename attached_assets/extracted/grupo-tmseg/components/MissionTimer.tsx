
import React, { useState, useEffect, memo } from 'react';
import { AlertCircle, Clock, AlertTriangle, Timer } from 'lucide-react';
import { MissionStatus } from '../types';

interface MissionTimerProps {
    status: string;
    startTime?: string;
    createdAt: string;
}

const MissionTimer: React.FC<MissionTimerProps> = ({ status, startTime, createdAt }) => {
    const [display, setDisplay] = useState<{ label: string, time: string, style: string, icon: any } | null>(null);

    useEffect(() => {
        const calculate = () => {
            const now = new Date().getTime();
            let start = 0;
            let isCountdown = false;
            let show = false;

            if ([MissionStatus.SOLICITED, MissionStatus.SCHEDULED, MissionStatus.DOCUMENTATION].includes(status as MissionStatus)) {
                if (startTime) {
                    start = new Date(startTime).getTime();
                    isCountdown = true;
                    show = true;
                }
            } else if ([MissionStatus.ORIGIN, MissionStatus.IN_TRANSIT].includes(status as MissionStatus)) {
                start = startTime ? new Date(startTime).getTime() : new Date(createdAt).getTime();
                isCountdown = false;
                show = true;
            }

            if (!show) {
                setDisplay(null);
                return;
            }

            const diff = isCountdown ? start - now : now - start;
            const absDiff = Math.abs(diff);

            const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

            const hh = hours.toString().padStart(2, '0');
            const mm = minutes.toString().padStart(2, '0');
            const ss = seconds.toString().padStart(2, '0');
            
            let timeStr = `${hh}:${mm}:${ss}`;
            if (days > 0) timeStr = `${days}d ${timeStr}`;

            if (isCountdown) {
                if (diff > 0) {
                    if (diff <= 3600000) { 
                         setDisplay({
                            label: 'Iminente',
                            time: timeStr,
                            style: 'text-yellow-700',
                            icon: AlertCircle
                        });
                    } else {
                        setDisplay({
                            label: 'Previsto',
                            time: timeStr,
                            style: 'text-blue-700',
                            icon: Clock
                        });
                    }
                } else {
                    setDisplay({
                        label: 'Atraso',
                        time: timeStr,
                        style: 'text-red-700 font-bold',
                        icon: AlertTriangle
                    });
                }
            } else {
                setDisplay({
                    label: 'Em Operação',
                    time: timeStr,
                    style: 'text-emerald-700',
                    icon: Timer
                });
            }
        };

        calculate();
        const interval = setInterval(calculate, 1000);
        return () => clearInterval(interval);
    }, [status, startTime, createdAt]);

    if (!display) return null;

    const Icon = display.icon;

    return (
        <div className={`mt-2 flex items-center gap-1.5 text-xs ${display.style}`}>
            <Icon size={12} strokeWidth={2.5} />
            <span className="font-bold uppercase opacity-80 text-[10px]">{display.label}:</span>
            <span className="font-mono font-bold tracking-tight tabular-nums uppercase">{display.time}</span>
        </div>
    );
};

export default memo(MissionTimer);
