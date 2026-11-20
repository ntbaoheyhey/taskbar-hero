import {neutralPose,type RootPose} from '../battle-v3/motion';

export const BOSS_LANDING_MS=240;
export const BOSS_ARRIVAL_MS=620;

/** Normalized bottom-to-top rim sweep immediately after the planted frame. */
export function bossLandingSweep(ageMs:number,reduced:boolean) {
 const progress=(ageMs-BOSS_LANDING_MS)/260;
 return !reduced&&progress>=0&&progress<1?progress:-1;
}
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};

/** Presentation age only: no action delay, and no displacement at contact. */
export function bossArrival(ageMs:number,height:number,options:{disabled?:boolean;actionElapsed?:number;hitInMs?:number}={}):RootPose {
 const p=neutralPose();
 if(options.disabled||ageMs<0||ageMs>=BOSS_ARRIVAL_MS)return p;
 const action=options.actionElapsed===undefined?1:1-smooth(options.actionElapsed/80);
 const contact=options.hitInMs===undefined?1:smooth(options.hitInMs/150);
 const weight=action*contact,k=height/720;
 if(weight<=0)return p;
 const flight=1-smooth(ageMs/BOSS_LANDING_MS);
 const settle=Math.sin(Math.PI*Math.max(0,(ageMs-BOSS_LANDING_MS)/(BOSS_ARRIVAL_MS-BOSS_LANDING_MS)));
 p.x=64*k*flight*weight;p.y=-58*k*flight*weight;
 p.sx=1+.035*settle*weight;p.sy=1-.055*settle*weight;
 p.phase=ageMs<BOSS_LANDING_MS?'travel':'land';
 return p;
}
