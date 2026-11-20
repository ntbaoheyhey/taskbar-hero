// ASTRA enemy-light hook
import {updateEnemyLight} from './enemy-relight';
import {CraftEncounter,isCraftOwner} from '../vfx-craft/encounter';
import {pinCompiledPrograms} from './program-pin';
import {canNarrowBattleAtlases,prepareBattleAtlases} from './effect-preload-selection';
import {CasterFocus,FocusBannerAnchor} from '../battle-v3/focus';
import {BattlePostFx} from '../battle-v3/post-fx';
import {BattleAudio} from '../battle-v3/battle-audio';
import {CinematicPlayer} from '../battle-v3/cinematic-player';
import {sequenceAt,sequenceWorldTime,type SequencePlan} from '../battle-v3/sequence';
import * as T from 'three';
import type { TurnActor } from '@taskbar-hero/game-rules/src/squad/turn/types';
import type { SceneView, Anchor } from '../../squad/turn3d/scene';
import type { EffectPlan } from '../../squad/turn3d/effects';
import { layoutLabels, intersects, type Rect, type LabelInput } from '../../squad/turn3d/label-layout';
import {BattleNumbers as PuppetNumbers} from '../battle-v3/numbers';
import {BodyFx} from '../battle-v3/body-fx';
import {bodyStatuses} from '../battle-v3/status';
import {bodyTint} from '../battle-v3/clarity';
import {actionPose,attackMotion,bracePose,hitPose,idlePhase,idlePose,neutralPose,type MotionPoint} from '../battle-v3/motion';
import {MotionTrails} from '../battle-v3/motion-trails';
import {meleeContact,meleeRoot,denseMeleeRoot} from '../battle-v3/class-motion';
import {BossPhase} from '../battle-v3/boss-phase';
import {BattleWeather} from '../battle-v3/weather';
import {crowdPose} from '../battle-v3/crowd';
import {impactFeedback,isSupportCast} from '../battle-v3/presentation';
import { loadSpineActor, type SpineActor, spineCacheStats } from './assets';
import { SPINE_SKILLS, type SpineSocket } from './config';
import { fixedActionClipTime,retimedClipTime, type SpineCue } from './events';
import { stagePosition } from './layout';
import { stageLayoutC2 } from '../stage/layout-c2';
import {unitCore,unitFace,spriteFacing,ELEMENT_COLORS} from '../stage/core';
import {actorOpaqueWorldBounds} from '../stage/media-pose-bounds';
import { PaintedStage } from './stage';
import { PAINT } from './style';
import { PaintedVfx } from './vfx';
import {getV5Timeline,skillPoseTime} from '../vfx-layered/skill-timeline';
import { cinematicBox } from './cinematics';
import { chargeEvent } from '../depth/card-action-plan';
import {DrawnPoses,loadDrawnPoseSet} from '../vfx-craft/drawn-poses';
import {hasDesignerIdleBody} from './designer-idle-body';
import {mediaClipContact} from './media-clip-contact';
import {animationCues} from './events';
import {LIVING_CAT_SKILL_EVENTS} from '../../rig/living-cast';
import {paintedTargets} from './vfx-registry';
import {PaintLight} from '../vfx-craft/paint-light';
import {PaintDeath} from '../vfx-craft/paint-death';
import {bossArrival,BOSS_LANDING_MS} from './boss-arrival';
import {UltimateDirector} from '../ultimate/director';
import {knockback} from '../ultimate/timeline';
import {paintGrade} from '../../rig/atlas-color';
import {enemyIdleLife,ENEMY_GRADE,ENRAGED_GRADE,IDENTITY_GRADE,hitColor} from './enemy-life';
const ENRAGED_TINT=new T.Color(.94,.7,.78);
import {UltimateGlLayer,fxPalette} from '../ultimate/fx-gl';
import {DesignerVideoActorMedia} from './designer-video';

interface DisplayActor {actor:SpineActor;craftPose?:DrawnPoses;craftLight?:PaintLight;craftDeath?:PaintDeath;asset:string;entered:number;hurtAt:number;koAt:number;phaseAt:number;phase:number;lane:number;entranceDone:boolean;shadow:T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>;ring:T.Mesh<T.RingGeometry,T.MeshBasicMaterial>;hit:T.Mesh<T.RingGeometry,T.MeshBasicMaterial>}
interface SceneAnchor extends Anchor {labelTarget?:{x:number;y:number;avoid:Rect}}
/** A6-compatible renderer. Rules and their impact snapshot remain owned by DepthModel. */
export class SpineScene {
 private audio=new BattleAudio();
 readonly scene=new T.Scene();readonly camera=new T.OrthographicCamera(-1,1,1,0,.1,1000);
 readonly renderer:T.WebGLRenderer;readonly actors=new Map<string,DisplayActor>();
 /** Advance the presentation immediately before taking this frame's view. */
 beforeFrame?: (now:number)=>void;
 readonly loading={completed:0,total:1,label:'Lighting the lanterns…'};ready=false;
 readonly stats={frames:0,calls:0,triangles:0,geometries:0,textures:0,particles:0,estimatedGpuBytes:0,loaded:0,hiddenFrames:0,quality:'high' as 'high'|'medium'|'low'};
 readonly labelAudit:{heads:Rect[];cards:Rect[];missing:string[];overlaps:number}={heads:[],cards:[],missing:[],overlaps:0};
 private cinematicRects:Rect[]=[];
 readonly eventAudit:{actorId:string;name:string;fallback:boolean;skillId:string;elapsed:number}[]=[];
 readonly motionAudit:{id:string;asset:string;homeX:number;homeY:number;x:number;y:number;dx:number;dy:number;phase:string;archetype:string;hitOffset:number;flash:number;crowd:string}[]=[];
 readonly anchors:SceneAnchor[]=[];
 readonly cinematic={ultimateVisible:false,actorId:'',box:null as Rect|null,phaseVisible:false,phaseText:'',phaseBox:null as Rect|null,focus:0};
 private stage=new PaintedStage(()=>this.invalidate());private numbers:PuppetNumbers;readonly effects:PaintedVfx;private resize:ResizeObserver;
 private disposed=false;private pending=new Map<string,symbol>();private failed=new Set<string>();private lanes=new Map<string,{side:string;lane:number}>();private raf=0;private last=0;private time=0;private dirty=true;
 private effectsKey:string|undefined;private effectsRequest:symbol|undefined;private effectsLoaded=false;
 private width=1;private height=1;private worldWidth=1;private scratch=new T.Vector3();
 private plan:EffectPlan|null=null;private firstHit=false;private ultimate=false;private castAt=-100;private hitAt=-100;private currentView?:SceneView;private renderTime=0;
 private c2Seats=new Map<string,number>();private c2Capacity=4;
 private battleKey:unknown;private ultStartedAt=-100;private ultEndedAt=-100;private phaseNoticeAt=-100;private phaseNoticeArrival=false;
 private hitstopUntil=0;private sampled=new Map<string,{name:string;key:unknown;at:number}>();
 private casterFocus=new CasterFocus();
 /** V9 five-beat ultimates for the MVP cats (cut-in, cast, impact, linger). */
 private ult5!:UltimateDirector;
 /** V10 light-like hit sparks for every regular damage contact. */
 private hitLights!:UltimateGlLayer;private hits:{id:string;at:number;color:[number,number,number];power:number}[]=[];
 /** Q3.B authoring only. Normal builds retain the accepted scene until review. */
 private craftEffects=new CraftEncounter(this.scene);
 private get craft(){return this.craftEffects.effects.lantern;}
 private get craftBasic(){return this.craftEffects.effects.basic;}
 private get craftShield(){return this.craftEffects.effects.shield;}
 private get craftHeal(){return this.craftEffects.effects.heal;}
 private get craftOven(){return this.craftEffects.effects.oven;}
 private get craftThread(){return this.craftEffects.effects.thread;}
 private get craftTea(){return this.craftEffects.effects.tea;}
 private get craftNeedle(){return this.craftEffects.effects.needle;}
 private get craftYarn(){return this.craftEffects.effects.yarn;}
 private get craftLoaded(){return this.effectsLoaded;}
 private focusBanner=new FocusBannerAnchor();
 private homes=new Map<string,{x:number;y:number;scale:number;order:number;point:MotionPoint}>();
 private trails=new MotionTrails();
 private bossPhase:BossPhase;
 private weather:BattleWeather;
 private postFx:BattlePostFx;readonly cinema:CinematicPlayer;private bodyFx:BodyFx;private shadowTexture:T.CanvasTexture;private geometry=new T.PlaneGeometry(1,1);private ringGeometry=new T.RingGeometry(.87,1,48);
 private bodyBoxes=new Map<string,Rect>();private groundContacts=new Map<string,{x:number;y:number;scale:number;halfWidth:number}>();
 private contextLost=false;private restoringContext=false;private failureMessage='';
 private reportFailure(message:string){if(this.disposed)return;this.failureMessage=message;this.onFailure(message);}
 private contextChanged(lost:boolean){
  if(this.disposed)return;
  this.contextLost=lost;this.restoringContext=!lost;
  if(lost)this.onFailure('The cafe canvas needs a reload. Battle controls remain available.');else this.invalidate();
 }
 private finishContextRecovery(){
  if(this.disposed||this.contextLost||!this.restoringContext||this.renderer.getContext().isContextLost())return;
  this.restoringContext=false;this.onFailure(this.failureMessage);
 }
 private lost=(event:Event)=>{if(this.disposed)return;event.preventDefault();this.contextChanged(true);};
 private restored=()=>this.contextChanged(false);
 private mediaSuspended=false;
 private syncMediaSuspension(view:SceneView){
  if(this.disposed)return;
  const suspended=document.hidden||!!view.suspended;let managed=false;
  for(const {asset,actor} of this.actors.values())if(hasDesignerIdleBody(asset,actor)){
   // Optional structural hook keeps the unregistered/native actor API unchanged.
   const media=(actor as SpineActor&{designerMedia?:{setSuspended?:(value:boolean)=>void}}).designerMedia;
   if(media?.setSuspended){media.setSuspended(suspended);managed=true;}
  }
  if(managed&&this.mediaSuspended!==suspended){this.mediaSuspended=suspended;this.invalidate();}
 }
 private visibility=()=>{this.last=0;this.dirty=true;this.syncMediaSuspension(this.view());};
 private pick=(event:PointerEvent)=>{const box=this.renderer.domElement.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;for(const unit of this.sizeAudit().units){if(x>=unit.box.x&&x<=unit.box.x+unit.box.width&&y>=unit.box.y&&y<=unit.box.y+unit.box.height){this.onTarget(unit.id);break;}}};
 constructor(private host:HTMLElement,readonly view:()=>SceneView,private onAnchors:(anchors:Anchor[])=>void,private onTarget:(id:string)=>void,private onFailure:(message:string)=>void){
  this.renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power',preserveDrawingBuffer:true});
  this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.NoToneMapping;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  this.renderer.setClearColor(PAINT.wall);this.renderer.domElement.setAttribute('role','img');this.renderer.domElement.setAttribute('aria-label','Painted 2D cafe battlefield');this.renderer.domElement.dataset.lookSpine='true';
  this.renderer.domElement.addEventListener('webglcontextlost',this.lost);this.renderer.domElement.addEventListener('webglcontextrestored',this.restored);this.renderer.domElement.addEventListener('pointerup',this.pick);host.appendChild(this.renderer.domElement);
  this.effects=new PaintedVfx(host,(id,socket)=>this.socket(id,socket),id=>this.pixelsPerUnit(id));this.numbers=new PuppetNumbers(host);this.bodyFx=new BodyFx(host);this.bossPhase=new BossPhase(host);this.camera.position.set(0,0,100);this.scene.add(this.stage.root,this.trails.root,this.casterFocus.root);this.postFx=new BattlePostFx(this.renderer,this.scene,this.camera);this.cinema=new CinematicPlayer(host);
  this.weather=new BattleWeather(host);
  this.ult5=new UltimateDirector(host,this.scene);this.hitLights=new UltimateGlLayer(host);
  this.ult5.onBeat=(beat,recipe)=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('th:ult-beat',{detail:{beat,cat:recipe.cat,cue:beat==='cutin'?recipe.sound.cutin:beat==='squash'?recipe.sound.cast:beat==='impact'?recipe.sound.impact:beat==='linger'?recipe.sound.linger:undefined}}));};
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const c=canvas.getContext('2d')!;c.scale(1,.5);
  const glow=c.createRadialGradient(64,64,1,64,64,64);glow.addColorStop(0,'#49333a70');glow.addColorStop(.55,'#49333a38');glow.addColorStop(1,'#49333a00');c.fillStyle=glow;c.fillRect(0,0,128,128);this.shadowTexture=new T.CanvasTexture(canvas);this.shadowTexture.colorSpace=T.SRGBColorSpace;
  this.resize=new ResizeObserver(()=>this.invalidate());this.resize.observe(host);document.addEventListener('visibilitychange',this.visibility);
  this.ensureActors(this.view());this.raf=requestAnimationFrame(this.loop);
 }
 invalidate(){this.dirty=true;}
 prepare(view=this.view()){this.ensureActors(view);this.syncMediaSuspension(view);this.invalidate();}
 private ensureActors(view:SceneView){
  if(this.disposed)return;
  if(view.battleKey!==undefined&&view.battleKey!==this.battleKey){
   this.c2Seats?.clear();this.c2Capacity=4;this.homes.clear();
   this.battleKey=view.battleKey;this.plan=null;this.sampled.clear();this.effects.clear();this.ultimate=false;this.ultStartedAt=-100;this.ultEndedAt=-100;this.phaseNoticeAt=-100;
   for(const [id,entry] of this.actors){entry.entered=this.time+entry.lane*PAINT.entranceStagger;entry.entranceDone=false;entry.hurtAt=-100;entry.koAt=-1;entry.phaseAt=-100;entry.phase=view.bossPhases?.[id]??1;}
  }
  const owners=[...new Set(view.actors.map(unit=>view.models?.[unit.id]??unit.cardRpg?.cardId??'mochi'))].sort();
  // The persistent field also samples these atlases when primary layers are off.
  const layered=!!view.formationC2,narrow=canNarrowBattleAtlases(view);
  const key=JSON.stringify([layered,owners,narrow,narrow&&this.effects.overrides.effects.size>0]);
  if(key!==this.effectsKey){
   const request=Symbol(key);this.effectsRequest=request;this.effectsKey=key;this.effectsLoaded=owners.length===0;
   if(owners.length)void Promise.all([narrow?prepareBattleAtlases(this.effects,owners,layered,true):this.effects.prepare(owners,layered),this.craftEffects.prepare(owners)]).then(()=>{
    if(this.disposed||this.effectsRequest!==request)return;
    this.effectsLoaded=true;this.refreshLoading();this.invalidate();
   }).catch(error=>{
    if(this.disposed||this.effectsRequest!==request)return;
    this.reportFailure(`Could not prepare battle effects: ${String(error)}`);this.refreshLoading();
   });
  }
  const ids=new Set(view.actors.map(a=>a.id));
  for(const [id,entry] of this.actors)if(!ids.has(id)){this.releaseActor(entry);this.actors.delete(id);this.homes.delete(id);}
  // Removed requests no longer reserve a slot or hold the current roster's
  // loading gate. A request token also handles remove/return before completion.
  for(const id of this.lanes.keys())if(!ids.has(id)){this.lanes.delete(id);this.pending.delete(id);this.failed.delete(id);this.sampled.delete(id);}
  // Crew order is shared with the HP/rage cards. A retained cat must move to
  // its new slot when the roster changes; enemy identity lanes remain stable.
  let partyLane=0;
  for(const unit of view.actors)if(unit.side==='party'){
   const assigned=this.lanes.get(unit.id),entry=this.actors.get(unit.id);
   if(assigned)assigned.lane=partyLane;else this.lanes.set(unit.id,{side:'party',lane:partyLane});
   if(entry)entry.lane=partyLane;partyLane++;
  }
  for(const unit of view.actors){
   if(this.actors.has(unit.id)||this.pending.has(unit.id)||this.failed.has(unit.id))continue;
   const request=Symbol(unit.id);this.pending.set(unit.id,request);this.ready=false;
   const occupied=[...this.lanes.values()].filter(a=>a.side===unit.side).map(a=>a.lane);let lane=unit.side==='party'?this.lanes.get(unit.id)!.lane:0;if(unit.side==='enemy')while(occupied.includes(lane))lane++;this.lanes.set(unit.id,{side:unit.side,lane});
   const asset=view.models?.[unit.id]??unit.cardRpg?.cardId??'mochi';
   void loadSpineActor(asset,undefined,{deferNativePixels:isCraftOwner(asset)}).then(async actor=>{
    if(this.disposed||this.pending.get(unit.id)!==request||!this.view().actors.some(a=>a.id===unit.id)){actor.dispose();return;}
    if(actor.mesh?.enableLivingCat?.(asset)){
     for(const name of ['idle','idle-phase2'])if(actor.clips.has(name))actor.clips.set(name,{duration:10,cues:[]});
     actor.clips.set('skill',{duration:1,cues:animationCues('skill',1,[...LIVING_CAT_SKILL_EVENTS])});
    }
    // The media loader marks only a successfully prepared commissioned body.
    // Failed/unregistered media still uses the existing drawing fallback.
    const mediaBody=hasDesignerIdleBody(asset,actor);
    const drawings=!mediaBody&&isCraftOwner(asset)&&actor.source!=='designer'&&actor.source!=='sequence'
     ?await loadDrawnPoseSet(asset).catch(error=>{actor.dispose();throw error;}):undefined;
    if(this.disposed||this.pending.get(unit.id)!==request||!this.view().actors.some(a=>a.id===unit.id)){actor.dispose();return;}
    const craftPose=drawings?new DrawnPoses(actor,drawings):undefined;
    const craftLight=craftPose?new PaintLight(actor):undefined;if(craftLight)this.scene.add(craftLight.ground,craftLight.rim);
    const craftDeath=actor.mesh?new PaintDeath(actor):undefined;if(craftDeath)this.scene.add(craftDeath.fragments);
    const shadow=new T.Mesh(this.geometry,new T.MeshBasicMaterial({map:this.shadowTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));shadow.renderOrder=-10;
    const ring=new T.Mesh(this.ringGeometry,new T.MeshBasicMaterial({color:PAINT.honey,transparent:true,opacity:.6,depthTest:false,depthWrite:false,toneMapped:false}));ring.renderOrder=-5;
    const hit=new T.Mesh(this.ringGeometry,new T.MeshBasicMaterial({color:PAINT.cream,transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false}));hit.renderOrder=80;
    lane=this.lanes.get(unit.id)?.lane??lane;
    const entry={actor,craftPose,craftLight,craftDeath,asset,entered:this.time+lane*PAINT.entranceStagger,hurtAt:-100,koAt:-1,phaseAt:-100,phase:view.bossPhases?.[unit.id]??1,lane,entranceDone:false,shadow,ring,hit};this.actors.set(unit.id,entry);
    this.syncMediaSuspension(this.view());
    actor.onCue=cue=>this.onCue(unit.id,cue);
    if(asset==='mochi'||asset==='clover'||asset==='soot')actor.onMediaFrame=()=>this.invalidate();
    this.scene.add(actor.root,shadow,ring,hit);
    this.invalidate();
   }).catch(error=>{
    if(this.disposed||this.pending.get(unit.id)!==request||!this.view().actors.some(a=>a.id===unit.id))return;
    this.failed.add(unit.id);this.reportFailure(`Could not prepare ${asset}: ${String(error)}`);
   }).finally(()=>{if(this.pending.get(unit.id)===request)this.pending.delete(unit.id);if(!this.disposed)this.refreshLoading();});
  }
  this.refreshLoading();
 }
 private refreshLoading(){
  this.loading.completed=this.actors.size;this.loading.total=this.actors.size+this.pending.size+this.failed.size;this.stats.loaded=this.actors.size;
  this.ready=this.pending.size===0&&this.failed.size===0&&this.effectsLoaded;
 }
 private craftHandles(plan:EffectPlan|null){return this.craftLoaded&&!!plan&&!chargeEvent(plan)&&
  !this.effects.overrides.effects.has(plan.presentationId??plan.skillId)&&isCraftOwner(this.actors.get(plan.actorId)?.asset??'');}
 private onCue(actorId:string,cue:SpineCue){
  const view=this.currentView??this.view(),frame=view.frame,actor=this.actors.get(actorId)?.actor;if(!frame||actorId!==frame.plan.actorId||!actor)return;
  if(!this.craftHandles(frame.plan)&&!this.ult5?.active)this.effects.cue(cue,frame,this.renderTime,view.playbackSpeed??1,view.actors,actor.cues());
  this.eventAudit.push({actorId,name:cue.name,fallback:cue.fallback,skillId:frame.plan.skillId,elapsed:frame.elapsed});if(this.eventAudit.length>240)this.eventAudit.shift();
  if(cue.name==='ult-start'){this.ultimate=true;this.ultStartedAt=this.renderTime;this.ultEndedAt=-100;this.cinematic.actorId=actorId;}
  if(cue.name==='ult-end'){this.ultimate=false;this.ultEndedAt=this.renderTime;}
  if(cue.name==='cast')this.castAt=this.renderTime;
  if(cue.name==='hit'){
   this.firstHit=true;
   if(frame.plan.events.some(e=>e.type==='damage')){
    this.hitAt=this.renderTime;
    if(!(frame.plan as SequencePlan).fixedTiming&&!view.reducedMotion&&view.fixedTime===undefined)this.hitstopUntil=performance.now()+(sequenceAt(frame.plan,frame.elapsed)?.seq.tier==='ultimate'?100:PAINT.hitstopMs);
   }
   const attacker=this.actors.get(frame.plan.actorId);
   for(const id of frame.plan.targetIds){const target=this.actors.get(id);if(target&&frame.plan.events.some(e=>e.targetIds.includes(id)&&e.type==='damage')){target.hurtAt=this.renderTime;if(!view.reducedMotion)this.hits.push({id,at:this.renderTime,color:hitColor(attacker?.asset),power:frame.plan.ultimate?1.3:1});}}
  }
 }
 private loop=(now:number)=>{
  if(this.disposed)return;
  this.beforeFrame?.(now);
  const delta=this.last?Math.min(.1,(now-this.last)/1000):0;this.last=now;const view=this.view();
  this.syncMediaSuspension(view);
  if(document.hidden||view.suspended){this.stats.hiddenFrames++;this.raf=requestAnimationFrame(this.loop);return;}
  // Display changes can alter density without a CSS resize, including while paused.
  if(this.renderer.getPixelRatio()!==Math.min(devicePixelRatio||1,2))this.dirty=true;
  this.ensureActors(view);if(!view.paused&&this.ready)this.time+=delta*(view.playbackSpeed??1);
  if(!view.paused||this.dirty){this.render(view,delta);this.dirty=false;}
  this.raf=requestAnimationFrame(this.loop);
 };
 private resizeViewport(width:number,height:number){
  if(this.disposed)return;
  const ratio=Math.min(devicePixelRatio||1,2),densityChanged=this.renderer.getPixelRatio()!==ratio;
  const sizeChanged=width!==this.width||height!==this.height;
  if(densityChanged)this.renderer.setPixelRatio(ratio);
  if(sizeChanged){this.width=width;this.height=height;this.renderer.setSize(width,height);this.worldWidth=PAINT.worldHeight*width/height;}
  if(densityChanged||sizeChanged)this.postFx.resize(width,height);
 }
 render(view:SceneView,delta=0){
  if(this.disposed)return;
  const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight);
  this.resizeViewport(width,height);
  const time=view.fixedTime??this.time,frame=view.frame,plan=frame?.plan??null;this.currentView=view;this.renderTime=time;
  const sequence=frame?sequenceAt(frame.plan,frame.elapsed,view.reducedMotion):null;
  this.effects.useLayered=!!view.formationC2&&view.layeredVfx!==false;
  if(this.plan!==plan){this.plan=plan;this.firstHit=false;this.ultimate=false;this.ultStartedAt=-100;this.ultEndedAt=-100;this.castAt=-100;this.hitAt=-100;this.hitstopUntil=0;if(this.craftHandles(plan))this.effects.clear();}
  if(frame&&!this.actors.has(frame.plan.actorId)&&frame.elapsed>=frame.plan.beats[2]!.start)this.firstHit=true;
  this.camera.left=-this.worldWidth/2;this.camera.right=this.worldWidth/2;this.camera.top=PAINT.worldHeight;this.camera.bottom=0;this.camera.zoom=1;this.camera.position.x=0;this.camera.position.y=0;
  this.camera.rotation.z=0;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  const ultEntry=plan?this.actors.get(plan.actorId):undefined;
  const ultMedia=ultEntry?.actor.designerMedia instanceof DesignerVideoActorMedia?ultEntry.actor.designerMedia.media:undefined;
  const ult5=frame&&plan&&ultEntry&&this.ult5.owns(!!plan.ultimate,ultEntry.asset)&&!view.model
   ?this.ult5.begin({planId:`${(plan as {id?:unknown}).id??plan.skillId}:${plan.actorId}`,asset:ultEntry.asset,elapsed:frame.elapsed,reduced:!!view.reducedMotion,paused:!!view.paused,width,height},ultMedia):this.ult5.begin(null,undefined);
  const ultLive=ult5&&!ult5.done?ult5:null;
  if(ultLive)this.hitstopUntil=Math.max(this.hitstopUntil,this.ult5.hitstopDeadline);
  const focusDim=ultLive?ultLive.dim:sequence?.dim??0,focusLight=new T.Color().setRGB(1-focusDim,1-focusDim,1-focusDim,T.SRGBColorSpace).r;
  const activeEnemies=view.actors.filter(u=>u.side==='enemy'&&u.hp>0);
  if(activeEnemies.length>4)this.c2Capacity=6;
  if(view.formationC2)for(const unit of activeEnemies){
   if(this.c2Seats.has(unit.id))continue;
   const occupied=new Set(activeEnemies.filter(u=>u.id!==unit.id).map(u=>this.c2Seats.get(u.id)));
   const row=view.rows?.[unit.id]==='rear'?2:0;
   const choices=view.boss?[2,3]:[row,row+1,...[4,5,0,1,2,3].filter(i=>i!==row&&i!==row+1)];
   if(this.actors.get(unit.id)?.actor.unit.tier!=='boss')this.c2Seats.set(unit.id,choices.find(i=>!occupied.has(i))??row);
  }
  const layout=view.formationC2?stageLayoutC2(view.actors.flatMap(unit=>{
   const entry=this.actors.get(unit.id);
   const extents=entry?.craftPose?.layoutExtents;
   const mirrored=entry&&spriteFacing(entry.actor.unit.nativeFacing,unit.side)<0;
   return entry&&(unit.side==='party'||unit.hp>0)?[{id:unit.id,asset:entry.asset,side:unit.side,row:view.rows?.[unit.id]==='rear'?'rear' as const:'front' as const,
    ...(extents?{leftExtent:mirrored?extents.rightExtent:extents.leftExtent,rightExtent:mirrored?extents.leftExtent:extents.rightExtent}:{}),
    boss:entry.actor.unit.tier==='boss',aspect:entry.actor.bounds.width/entry.actor.bounds.height,coreHeight:unitCore(entry.asset,entry.actor.bounds).world.height/entry.actor.bounds.height,coreRatio:unitCore(entry.asset,entry.actor.bounds).ratio,bossRatio:unitCore(entry.asset,entry.actor.bounds).ratio,seat:unit.side==='enemy'?this.c2Seats.get(unit.id):undefined}]:[];
  }),this.worldWidth,PAINT.worldHeight,PAINT.worldHeight*(width<700?width*9/16:window.innerHeight)/height,this.c2Capacity):null;
  const pixelsToWorld=this.worldWidth/width;
  // Resolve all resting positions first, so target selection is independent of draw order.
  for(const unit of view.actors){
   const entry=this.actors.get(unit.id);if(!entry)continue;
   if(unit.hp<=0&&this.homes.has(unit.id))continue;
   const actor=entry.actor,core=unitCore(entry.asset,actor.bounds),box=layout?.get(unit.id),facing=spriteFacing(actor.unit.nativeFacing,unit.side);
   const base=stagePosition(unit.side,entry.lane,actor.unit.tier==='boss',view.boss,this.worldWidth);
   if(box){base.scale=box.coreHeight/core.world.height;base.x=box.footX-this.worldWidth/2-(actor.bounds.x+actor.bounds.width/2)*base.scale*facing;base.y=PAINT.worldHeight-box.footY-core.world.y*base.scale;}
   this.homes.set(unit.id,{...base,order:box?box.order:10+Math.round((1-base.y/PAINT.worldHeight)*30),point:{x:(base.x+(actor.bounds.x+actor.bounds.width/2)*base.scale*facing+this.worldWidth/2)/pixelsToWorld,y:(PAINT.worldHeight-base.y-core.world.y*base.scale)/pixelsToWorld,core:core.world.height*base.scale/pixelsToWorld}});
  }
  // Resting opaque rectangles are independent of last frame and actor iteration order.
  const homeBox=(id:string,key:'K0'|'K4'='K0')=>{
   const entry=this.actors.get(id)!,home=this.homes.get(id)!,draw=entry.craftPose?.drawing,side=view.actors.find(u=>u.id===id)!.side;
   if(draw){const m=draw.set.manifest,b=m.poses[key]!.opaqueBounds!,scale=home.point.core/m.opaqueHeight,facing=spriteFacing(entry.actor.unit.nativeFacing,side);
    const a=(b[0]-m.baseline[0])*scale*facing,c=(b[2]-m.baseline[0])*scale*facing;
    return{x:home.point.x+Math.min(a,c),y:home.point.y-(m.baseline[1]-b[1])*scale,width:Math.abs(c-a),height:(b[3]-b[1])*scale};}
   const w=entry.actor.bounds.width/entry.actor.bounds.height*home.point.core;
   return{x:home.point.x-w/2,y:home.point.y-home.point.core,width:w,height:home.point.core};
  };
  this.motionAudit.length=0;this.trails.root.visible=false;
  const healed:string[]=[];
  const healingCast=!!plan&&this.craftHandles(plan)&&['clover','teacup-healer'].includes(this.actors.get(plan.actorId)?.asset??'');
  const v5Timeline=plan?getV5Timeline(plan.presentationId??plan.skillId):undefined;
  const motionElapsed=frame?skillPoseTime(v5Timeline,frame.elapsed,frame.plan.beats[2]!.start,
   view.reducedMotion||!frame.plan.events.some(e=>e.actorId===frame.plan.actorId&&e.type==='damage'),frame.plan.ultimate?70:45):0;
  if(plan&&healingCast)paintedTargets(plan,'heal',view.actors,healed);
  const healAge=frame?frame.elapsed-frame.plan.beats[2]!.start:-1;
  const healBright=healAge>=0&&healAge<180?1+.12*(1-healAge/180):1;
  const ordered=[...view.actors].sort((a,b)=>Number(b.id===plan?.actorId)-Number(a.id===plan?.actorId));
  for(const unit of ordered){
   const entry=this.actors.get(unit.id);if(!entry)continue;const actor=entry.actor,boss=actor.unit.tier==='boss',position=stagePosition(unit.side,entry.lane,boss,view.boss,this.worldWidth);
   const core=unitCore(entry.asset,actor.bounds);
   const rear=view.rows?.[unit.id]==='rear';
   const tint=bodyTint(bodyStatuses(view.cardStatuses?.[unit.id],unit.shield),time,rear,view.reducedMotion);
   const home=this.homes.get(unit.id)!;Object.assign(position,home);
   if(unit.hp>0)entry.koAt=-1;
   else if(entry.koAt<0)entry.koAt=time;
   const deathAge=unit.hp<=0?time-entry.koAt:0;
   const enraged=boss&&unit.hp>0&&(view.bossPhases?.[unit.id]??1)>1,grade=unit.side==='enemy'&&!actor.mesh?.livingCat?(enraged?ENRAGED_GRADE:ENEMY_GRADE):IDENTITY_GRADE;
   actor.root.traverse(node=>{if(node instanceof T.Mesh){const material=node.material as T.MeshBasicMaterial;paintGrade(material)?.value.set(grade[0],grade[1]);material.color.setRGB(...tint);if(enraged)material.color.multiply(ENRAGED_TINT);if(unit.id!==plan?.actorId)material.color.multiplyScalar(focusLight);if(healed.includes(unit.id))material.color.multiplyScalar(healBright);material.opacity=unit.hp<=0&&!entry.craftDeath?Math.max(0,1-deathAge/.6):1;}});
   actor.root.visible=unit.hp>0||deathAge<.6;
   actor.root.rotation.z=0;actor.root.position.set(position.x,position.y,0);actor.root.scale.set(spriteFacing(actor.unit.nativeFacing,unit.side)*position.scale,position.scale,1);
   // Small formation actors stay readable in front of the broad Yarn cutout.
   actor.setOrder(entry.asset==='yarn-giant'&&entry.craftPose?Math.min(...[...this.homes.values()].map(h=>h.order))-1:home.order);
   entry.shadow.position.set(position.x,position.y-8,-2);entry.shadow.scale.set(Math.min(actor.bounds.width,actor.unit.targetHeight)*position.scale*1.12,core.world.height*position.scale*.13,1);
   entry.ring.visible=unit.hp>0;entry.ring.position.copy(entry.shadow.position);entry.ring.scale.set(core.world.height*position.scale*.38,core.world.height*position.scale*.095,1);entry.ring.material.color.set(ELEMENT_COLORS[entry.asset]??PAINT.rose);
   const phase=view.bossPhases?.[unit.id]??1;
   if(phase>entry.phase){entry.phase=phase;entry.phaseAt=time;this.phaseNoticeAt=time;this.phaseNoticeArrival=false;this.cinematic.phaseText=`${unit.name} · Phase ${phase}`;this.effects.accent(unit.id,'phase',time,view.playbackSpeed??1);}
   if(!entry.entranceDone&&(view.galleryPreview||time-entry.entered>=(boss?BOSS_LANDING_MS/1000:actor.duration('appear')*.8))){
    entry.entranceDone=true;if(!view.galleryPreview&&!view.reducedMotion)this.effects.accent(unit.id,'entrance',time,view.playbackSpeed??1);
    if(boss&&!view.galleryPreview&&unit.hp>0&&phase===1){this.phaseNoticeAt=time;this.phaseNoticeArrival=true;this.cinematic.phaseText=unit.name;}
   }
   const worldTime=sequence&&frame?time-frame.elapsed/1000+sequenceWorldTime(sequence.seq,frame.elapsed)/1000:time;
   const phaseOffset=idlePhase(unit.id);
   const crowd=crowdPose(view,unit,height);
   let name='idle',key:unknown='idle',at=(worldTime+phaseOffset)%actor.duration('idle');
   if(view.model){name=({ultimate:'ult',cast:'skill',hit:'hurt',KO:'ko'} as Record<string,string>)[view.model.clip]??view.model.clip;at=(view.modelProgress??0)*actor.duration(name);key=name;}
   else if(frame&&unit.id===frame.plan.actorId){
    name=chargeEvent(frame.plan)?'skill':SPINE_SKILLS.get(frame.plan.presentationId??frame.plan.skillId)?.animation??(frame.plan.ultimate?'ult':frame.clip==='attack'?'attack':'skill');key=frame.plan;
    const authored=sequence?.seq.casterAnim.filter(k=>k.t<=frame.elapsed&&k.name).at(-1)?.name;
    if(authored&&!chargeEvent(frame.plan))name=authored;
    // Native active cards keep the living cast even when a legacy effect track
    // labels its body motion as attack. Basic and ultimate clips stay authored.
    if(actor.mesh?.livingCat&&!frame.plan.ultimate&&SPINE_SKILLS.get(frame.plan.presentationId??frame.plan.skillId)?.animation==='skill')name='skill';
    if(entry.craftPose&&!chargeEvent(frame.plan))name=frame.plan.ultimate?'ult':
     ['mochi','panko'].includes(entry.asset)&&isSupportCast(frame.plan)?'skill':'attack';
    const duration=actor.duration(name),hit=mediaClipContact(entry.asset,actor,name,duration);
    at=entry.craftPose?.owns(name)?Math.min(duration,motionElapsed/1000):(frame.plan as SequencePlan).fixedTiming
     ?fixedActionClipTime(motionElapsed,duration,hit,frame.plan.beats[2]!.start,frame.plan.duration,frame.plan.ultimate?600:0)
     :retimedClipTime(frame.actionProgress,duration,hit,frame.plan.beats[2]!.start/frame.plan.duration);
   }else if(unit.hp<=0){if(entry.koAt<0)entry.koAt=time;name='ko';key=entry.koAt;at=time-entry.koAt;}
   else if(time-entry.hurtAt<actor.duration('hurt')){name='hurt';key=entry.hurtAt;at=time-entry.hurtAt;}
   else if(crowd.kind!=='idle'){name=crowd.kind==='cheer'?'victory':'hurt';key=plan;at=crowd.age/650*actor.duration(name);}
   else if(time-entry.phaseAt<actor.duration('enrage')&&actor.clips.has('enrage')){name='enrage';key=entry.phaseAt;at=time-entry.phaseAt;}
   else if(time-entry.entered<actor.duration('appear')&&!view.galleryPreview&&!view.reducedMotion){name='appear';key=entry.entered;at=Math.max(0,time-entry.entered);}
   else if(entry.phase>1&&actor.clips.has('idle-phase2')){name='idle-phase2';key=name;at=time%actor.duration(name);}
   const statuses=bodyStatuses(view.cardStatuses?.[unit.id]);
   if(unit.hp>0&&name==='idle'&&statuses.includes('stun')&&actor.clips.has('stunned')){name='stunned';key=name;at=worldTime%actor.duration(name);}
   const previous=this.sampled.get(unit.id),iced=statuses.includes('freeze'),frozen=iced||!view.reducedMotion&&view.fixedTime===undefined&&performance.now()<this.hitstopUntil;
   if(iced&&unit.hp>0&&previous){name=previous.name;key=previous.key;at=previous.at;}
   else if(frozen&&previous&&previous.name===name&&previous.key===key)at=previous.at;
   if(actor.mesh&&!frozen){actor.mesh.proceduralTime=worldTime+phaseOffset;if(actor.mesh.livingCat)actor.mesh.livingReducedMotion=!!view.reducedMotion;}
   if(entry.asset==='mochi'||entry.asset==='clover'||entry.asset==='soot')actor.sample(name,key,at,delta,this.camera,view.reducedMotion,
    // Hit-stop is 60-100 ms: pausing a video for it, then restarting it, makes all
    // three idles hitch on every hit. Only ice (a real status) stops the loop.
    {worldTime:worldTime+phaseOffset,paused:!!view.paused,fixedTime:view.fixedTime!==undefined,frozen:iced,playbackRate:view.playbackSpeed??1});
   else actor.sample(name,key,at,delta,this.camera,view.reducedMotion);
   const drawingDamage=unit.hp>0&&frame?.plan.events.some(e=>e.type==='damage'&&e.amount>0&&e.targetIds.includes(unit.id));
   const damageAge=drawingDamage&&frame?(frame.elapsed-frame.plan.beats[2]!.start)/1000:undefined;
   // Keep Yarn's authored contact visible through the fixed90ms impact hold.
   // Retaliation still flashes/recoils at impact; its guard drawing follows the hold.
   const drawingHitAge=entry.asset==='yarn-giant'&&unit.id===plan?.actorId&&damageAge!==undefined&&['attack','ult'].includes(name)?damageAge-.09:damageAge;
   const lookId=unit.id===plan?.actorId?plan.targetIds.find(id=>id!==unit.id):
    view.actors.find(a=>a.id===plan?.actorId&&a.side!==unit.side)?.id??view.actors.find(a=>a.side!==unit.side&&a.hp>0)?.id;
   const lookHome=this.homes.get(lookId??'')?.point;
   const look=lookHome?(lookHome.x-home.point.x)/Math.max(1,width*.3)*spriteFacing(actor.unit.nativeFacing,unit.side):0;
   const critAge=frame&&unit.id===plan?.actorId&&plan.events.some(e=>e.actorId===unit.id&&e.type==='damage'&&e.critical)?(frame.elapsed-plan.beats[2]!.start)/1000:-1;
   entry.craftPose?.deform(name,at,view.reducedMotion,drawingHitAge,worldTime+phaseOffset,look,critAge);
   entry.craftDeath?.setTime(name==='ko'?at:null,view.reducedMotion);
   if(entry.craftDeath&&name==='ko')actor.root.visible=at<.6;
   let rootPose=neutralPose(),reaction=neutralPose();
   const caster=plan?view.actors.find(a=>a.id===plan.actorId):undefined;
   const targetId=plan?.targetIds.find(id=>view.actors.some(a=>a.id===id&&a.side!==unit.side))??plan?.targetIds.find(id=>id!==unit.id);
   const target=this.homes.get(targetId??'')?.point??{...home.point,x:home.point.x+(unit.side==='enemy'?-1:1)*width*.30};
   const input=frame?{plan:frame.plan,elapsed:motionElapsed,asset:entry.asset,side:unit.side,home:home.point,target,width,height}:null;
   if(!view.reducedMotion&&!view.model&&!iced){
    if(input&&unit.id===plan?.actorId&&unit.hp>0)rootPose=actionPose(input);
    const damageSource=plan?.events.find(e=>e.type==='damage'&&e.amount>0&&e.targetIds.includes(unit.id))?.actorId;
    const from=this.homes.get(damageSource??caster?.id??'')?.point.x??(unit.side==='enemy'?0:width);
    reaction=hitPose(plan,frame?.elapsed??0,unit.id,home.point.x>=from?1:-1,height);
    if(rootPose.phase==='idle'&&unit.hp>0&&!statuses.includes('stun'))rootPose=bracePose(plan,frame?.elapsed??0,unit.id,home.point.x>=from?1:-1,height);
    if(rootPose.phase==='idle'&&crowd.kind!=='idle')rootPose=crowd.pose;
    if(rootPose.phase==='idle'&&unit.hp>0&&!iced&&!statuses.includes('stun')&&!hasDesignerIdleBody(entry.asset,actor)&&!actor.mesh?.livingCat)rootPose=idlePose(worldTime,unit.id);
    // A hit hold must also stop the recipient's brace/idle root, otherwise
    // their independent motion adds displacement to the bounded recoil.
    if(damageAge!==undefined&&damageAge>=0&&damageAge<.3)rootPose=neutralPose();
    if(unit.hp<=0){const fall=Math.min(1,deathAge/.4);rootPose.angle=(unit.side==='enemy'?-1:1)*fall*.9;rootPose.y=fall*12*height/720;}
   }
   // The pilot gesture already moves the trunk around planted feet. Applying
   // the old complete-card lean on top would undo that contact and deform the face.
   if(entry.craftPose&&!iced&&['attack','skill','ult','idle','hurt','ko'].includes(name))rootPose=neutralPose();
   // V9: the frozen designer frame is cast in code (squash, lunge, hold, step back).
   // Rigged bodies (Soot until its video lands) take the same root lunge over their own ult clip.
   if(ultLive?.pose&&unit.id===plan?.actorId&&!iced&&unit.hp>0){const p=ultLive.pose;rootPose={...neutralPose(),x:p.x,y:p.y,sx:p.sx,sy:p.sy,angle:p.angle,phase:p.phase==='lunge'?'travel':p.phase==='hold'?'strike':p.phase==='back'?'return':'anticipation'};}
   if(['mochi','panko','yarn-giant'].includes(entry.asset)&&entry.craftPose&&frame&&unit.id===plan?.actorId&&(!plan.ultimate||entry.asset==='yarn-giant')&&unit.hp>0&&!iced&&!view.model&&!chargeEvent(plan)&&!isSupportCast(plan)&&targetId&&this.actors.has(targetId)){
    const m=entry.craftPose.drawing.set.manifest,b=m.poses[plan.ultimate?'K5':'K2']!.opaqueBounds!,direction=unit.side==='enemy'?-1:1;
    const face=spriteFacing(actor.unit.nativeFacing,unit.side),scale=home.point.core/m.opaqueHeight;
    const reach=direction>0?Math.max((b[0]-m.baseline[0])*face,(b[2]-m.baseline[0])*face)*scale:-Math.min((b[0]-m.baseline[0])*face,(b[2]-m.baseline[0])*face)*scale;
    let targetBox=homeBox(targetId);
    const targetHome=this.homes.get(targetId)!.point;
    if(entry.asset==='yarn-giant'){
     // The broad strike reaches every recipient front edge, including blocked hits.
     // Use K4 only where an actual damaging event selects the recipient's hit drawing.
     const ids=[...new Set(plan.events.filter(e=>e.type==='damage'&&e.actorId===unit.id).flatMap(e=>e.targetIds))];
     const boxes=ids.filter(id=>this.actors.has(id)&&view.actors.some(a=>a.id===id&&a.side!==unit.side)).map(id=>homeBox(id,plan.events.some(e=>e.type==='damage'&&e.amount>0&&e.targetIds.includes(id))?'K4':'K0'));
     targetBox=boxes.sort((a,b)=>direction>0?b.x-a.x:(a.x+a.width)-(b.x+b.width))[0]??targetBox;
    }
    const corridor=this.c2Capacity>4&&!view.boss;
    const contact=meleeContact(home.point,{...targetHome,x:targetBox.x+targetBox.width/2},reach,targetBox.width/2,direction,(corridor?40:8)*height/720);
    if(corridor)contact.y-=96*height/720;
    // A full-height boss keeps its crown in frame while reaching an upper-row cat.
    if(entry.asset==='yarn-giant')contact.y=Math.max(home.point.core+height*.07,Math.min(height*.94,contact.y));
    // A tall boss can be struck at chest height. Matching its feet would put
    // the entire cat in the lower ally's seat despite already being in reach.
    const tallTarget=this.actors.get(targetId)!.actor.unit.tier==='boss';
    if(tallTarget)contact.y=Math.min(contact.y,home.point.y+40*height/720);
    // Reach a lower-row target at its upper silhouette, keeping the dash
    // above the ally seated below. The painted contact cut bridges the edge.
    if(!corridor&&!tallTarget&&contact.y>home.point.y+height*.1525){
     contact.y=home.point.y+height*.1525;
     contact.x+=direction*24*height/720;
    }
    rootPose=corridor&&entry.asset==='panko'&&contact.y<home.point.y-height*.25
     ?denseMeleeRoot(motionElapsed,home.point,contact)
     :meleeRoot(motionElapsed,plan.ultimate,home.point,contact,corridor?40*height/720:0,corridor||entry.asset==='yarn-giant'?0:(tallTarget?20:60)*height/720);
   }
   const arrival=bossArrival((time-entry.entered)*1000,height,{
    disabled:!boss||!entry.craftPose||!!view.galleryPreview||!!view.model||!!view.reducedMotion||unit.hp<=0||iced||statuses.includes('stun')||time-entry.hurtAt<actor.duration('hurt'),
    actionElapsed:frame&&unit.id===plan?.actorId?frame.elapsed:undefined,
    hitInMs:drawingDamage&&frame?frame.plan.beats[2]!.start-frame.elapsed:undefined,
   });
   if(arrival.phase!=='idle'){rootPose.x+=arrival.x;rootPose.y+=arrival.y;rootPose.sx*=arrival.sx;rootPose.sy*=arrival.sy;if(rootPose.phase==='idle')rootPose.phase=arrival.phase;}
   // V9: Last Lantern Vow's gold shockwave knocks every living enemy back.
   if(ultLive&&ultLive.recipe.cat==='mochi'&&caster&&unit.side!==caster.side&&unit.hp>0&&!iced){const push=knockback(ultLive.at,!!view.reducedMotion);if(push){reaction={...reaction,x:reaction.x+(unit.side==='enemy'?1:-1)*push*height*.045};}}
   // V10: enemies are never frozen cut-outs; each archetype breathes, hovers or wobbles in place.
   const life=unit.side==='enemy'&&!actor.mesh?.livingCat&&unit.hp>0&&!iced&&!statuses.includes('stun')?enemyIdleLife(entry.asset,time,entry.lane,height,!!view.reducedMotion):undefined;
   if(life)rootPose={...rootPose,y:rootPose.y+life.y,sx:rootPose.sx*life.sx,sy:rootPose.sy*life.sy,angle:rootPose.angle+life.angle};
   const dx=rootPose.x+reaction.x,dy=rootPose.y+reaction.y,sx=rootPose.sx*reaction.sx,sy=rootPose.sy*reaction.sy,angle=rootPose.angle+reaction.angle;
   // Pivot the complete cut-out around its measured feet; sockets and labels follow.
   const facing=spriteFacing(actor.unit.nativeFacing,unit.side),footX=(actor.bounds.x+actor.bounds.width/2)*position.scale*facing,footY=core.world.y*position.scale;
   actor.root.scale.set(facing*position.scale*sx,position.scale*sy,1);actor.root.rotation.z=-angle;
   const cos=Math.cos(-angle),sin=Math.sin(-angle);
   actor.root.position.set(position.x+footX-(cos*footX*sx-sin*footY*sy)+dx*pixelsToWorld,position.y+footY-(sin*footX*sx+cos*footY*sy)-dy*pixelsToWorld,0);
   actor.root.updateMatrixWorld(true);
   const opaque=actorOpaqueWorldBounds(entry.asset,actor);
   if(opaque&&opaque.height>0&&unit.hp>0&&view.formationC2&&!actor.mesh?.livingCat){
    const target=core.world.height*position.scale*arrival.sy*(life?.sy??1);
    const factor=Math.max(target*.985,Math.min(target*1.015,opaque.height))/opaque.height;
    // Constrain size around the planted foot; preserve the authored pose shape.
    const pivotX=position.x+footX+dx*pixelsToWorld,pivotY=position.y+footY-dy*pixelsToWorld;
    actor.root.scale.x*=factor;actor.root.scale.y*=factor;
    actor.root.position.x=pivotX+(actor.root.position.x-pivotX)*factor;
    actor.root.position.y=pivotY+(actor.root.position.y-pivotY)*factor;
    opaque.x=pivotX+(opaque.x-pivotX)*factor;opaque.y=pivotY+(opaque.y-pivotY)*factor;opaque.width*=factor;opaque.height*=factor;
    // Keep the complete posed silhouette inside the field, including legacy
    // root rotations and recoil. The extra half percent also reserves shake.
    const inset=this.worldWidth*.035;
    const edgeShift=Math.max(-this.worldWidth/2+inset-opaque.x,Math.min(this.worldWidth/2-inset-opaque.x-opaque.width,0));
    actor.root.position.x+=edgeShift;opaque.x+=edgeShift;entry.shadow.position.x+=edgeShift;
    actor.root.updateMatrixWorld(true);
   }
   actor.opaqueWorld=opaque;
   entry.shadow.position.x+=dx*pixelsToWorld;entry.shadow.position.y-=Math.max(0,dy)*pixelsToWorld;entry.shadow.material.opacity=unit.hp<=0?Math.max(0,1-deathAge/.6):1;
   entry.ring.position.copy(entry.shadow.position);
   // ASTRA enemy-light hook
   const directionalHit=unit.side==='enemy'&&updateEnemyLight(entry,view,unit,this,time,life?.sy??1,damageAge);
   if(reaction.flash&&!directionalHit)actor.root.traverse(node=>{if(node instanceof T.Mesh)(node.material as T.MeshBasicMaterial).color.lerp(new T.Color(2,2,2),.72);});
   if(input&&unit.id===plan?.actorId&&unit.hp>0&&!view.reducedMotion&&!entry.craftPose){
    this.trails.render(actor.root,[1,2,3].map(i=>actionPose({...input,elapsed:input.elapsed-i*1000/30})),rootPose,pixelsToWorld);
   }
   const measured=actor.root.localToWorld(this.scratch.set(actor.bounds.x+actor.bounds.width/2,core.world.y,0)),mx=(measured.x+this.worldWidth/2)/pixelsToWorld,my=(PAINT.worldHeight-measured.y)/pixelsToWorld;
   this.motionAudit.push({id:unit.id,asset:entry.asset,homeX:home.point.x,homeY:home.point.y,x:mx,y:my,dx:mx-home.point.x,dy:my-home.point.y,phase:rootPose.phase,archetype:plan?attackMotion(entry.asset,plan):'idle',hitOffset:Math.abs(reaction.x),flash:reaction.flash,crowd:crowd.kind});
   if(previous){previous.name=name;previous.key=key;previous.at=at;}else this.sampled.set(unit.id,{name,key,at});
   const since=time-this.hitAt,hitActive=this.firstHit&&!!plan?.targetIds.includes(unit.id)&&since>=0&&since<.32;
   entry.hit.visible=false;if(hitActive){actor.socket('vfxOrigin',entry.hit.position);entry.hit.scale.setScalar((.2+since)*actor.unit.targetHeight);entry.hit.material.opacity=(1-since/.32)*.65;}
   if(unit.id===plan?.actorId&&time-this.castAt<.4){entry.ring.visible=true;entry.ring.material.opacity=.3+.3*Math.sin((time-this.castAt)/.4*Math.PI);}else entry.ring.material.opacity=.3;
  }
  const focus=focusDim/.55;this.cinematic.focus=focus;
  // F2: no entry, actor-follow, fit-to-motion, plate or post-process camera.
  this.camera.zoom=1;this.camera.position.x=0;this.camera.position.y=0;this.camera.rotation.z=0;
  if(frame){
   const {shake}=impactFeedback(frame.plan,frame.elapsed,view.reducedMotion,healingCast),px=this.worldWidth/width;
   const shakeX=Math.sin(frame.elapsed*.105),shakeY=Math.cos(frame.elapsed*.085)*.4,shakeNorm=Math.max(1,Math.hypot(shakeX,shakeY));
   this.camera.position.x=shakeX/shakeNorm*shake*px;
   this.camera.position.y=shakeY/shakeNorm*shake*px;
   this.firstHit=frame.elapsed>=frame.plan.beats[2]!.start;
  }
  if(ultLive&&(ultLive.shake.x||ultLive.shake.y)){
   const px=this.worldWidth/width;this.camera.position.x+=ultLive.shake.x*px;this.camera.position.y+=ultLive.shake.y*px;this.camera.rotation.z+=ultLive.shake.angle;
  }
  this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  this.stage.update(this.worldWidth,PAINT.worldHeight,0,1-focusLight,view.formationC2);
  const focusActor=plan?this.actors.get(plan.actorId):undefined;
  this.casterFocus.render(focusActor?.actor.root,plan?.color??'#ffd892',focus,pixelsToWorld,!!focusActor&&hasDesignerIdleBody(focusActor.asset,focusActor.actor));
  this.scene.updateMatrixWorld(true);this.projectAnchors(view);
  this.weather.render(view,time,width,height,this.labelAudit.heads);
  const protectedRects=this.cinematicRects;
  this.cinematic.ultimateVisible=false;
  this.cinematic.box=this.cinematic.ultimateVisible?cinematicBox(width,height,protectedRects):null;
  this.cinematic.ultimateVisible&&=!!this.cinematic.box;
  this.cinematic.phaseVisible=time-this.phaseNoticeAt<PAINT.phaseSeconds&&!this.cinematic.ultimateVisible;
  this.cinematic.phaseBox=this.cinematic.phaseVisible?cinematicBox(width,height,protectedRects,this.phaseNoticeArrival?'arrival':true):null;
  this.cinematic.phaseVisible&&=!!this.cinematic.phaseBox;
  // V9 ultimates replace the older crafted/painted recipes for the MVP cats.
  if(!ultLive&&this.craftHandles(plan)&&frame&&plan){
   const casterAsset=this.actors.get(plan.actorId)?.asset,shield=casterAsset==='mochi',oven=casterAsset==='panko',thread=casterAsset==='binding-thread',needle=casterAsset==='needle-moth',yarn=casterAsset==='yarn-giant';
   const art=healingCast?(casterAsset==='teacup-healer'?this.craftTea!:this.craftHeal!):shield?this.craftShield!:oven?this.craftOven!:thread?this.craftThread!:needle?this.craftNeedle!:yarn?this.craftYarn!:(plan.ultimate?this.craft!:this.craftBasic!);
   for(const other of [this.craft,this.craftBasic,this.craftShield,this.craftHeal,this.craftOven,this.craftThread,this.craftTea,this.craftNeedle,this.craftYarn])if(other!==art)other?.hide();
   const source=this.craftSource(plan.actorId),home=this.homes.get(plan.actorId);
   const entry=this.actors.get(plan.actorId);
   const drawnSocket=(key:'K1'|'K2'|'K5')=>{const p=entry?.craftPose?.socketFor(key,'vfxOrigin');return p?this.screen(entry!.actor.root.localToWorld(this.scratch.set(p.x,p.y,1))):undefined;};
   // A released projectile retains its K1@200ms home socket, independent of
   // later keys, recoil and render history. Local hand glints still use source.
   const launchPoint=entry?.craftPose?.socketFor('K1','vfxOrigin',{clip:'attack',seconds:.2,reduced:view.reducedMotion});
   const facing=entry?spriteFacing(entry.actor.unit.nativeFacing,view.actors.find(a=>a.id===plan.actorId)?.side??'party'):1;
   const launch=launchPoint&&home?this.screen(this.scratch.set(home.x+launchPoint.x*home.scale*facing,home.y+launchPoint.y*home.scale,1)):undefined;
   // An action also contains retaliation and support. They keep their own
   // reaction/number passes; the offensive spell belongs to its caster.
   const casterSide=view.actors.find(a=>a.id===plan.actorId)?.side;
   // Hearthwall is an allied shield/cleanse. Its incidental retaliation must
   // not turn the protective cast into a dash or paint its crest on an enemy.
   const support=healingCast||(shield||oven)&&plan.ultimate;
   const affected=new Set(plan.events.filter(e=>e.actorId===plan.actorId&&(healingCast?e.type==='heal':support?e.type==='shield'||e.type==='heal':e.type==='damage'||e.type==='status_apply')).flatMap(e=>e.targetIds));
   const targets=[...affected].filter(id=>view.actors.some(a=>a.id===id&&(support?a.side===casterSide:a.side!==casterSide))).flatMap(id=>{const h=this.homes.get(id);return h?[h.point]:[];});
   const orders=[...this.actors.values()].map(e=>e.actor.root.renderOrder);
   if(source&&home&&targets.length)art.render({ultimate:plan.ultimate,home:home.point,casterFeet:this.socket(plan.actorId,'feet')??home.point,elapsed:frame.elapsed,width,height,worldWidth:this.worldWidth,worldHeight:PAINT.worldHeight,source,
    windupSource:plan.ultimate?drawnSocket('K1'):launch,releaseSource:drawnSocket(plan.ultimate?'K5':'K2'),
    layoutSource:{x:home.point.x+home.point.core*.40,y:home.point.y-home.point.core*.49},
    targets:targets.map(p=>({x:p.x,y:p.y-p.core*.42})),feet:targets.map(p=>({x:p.x,y:p.y})),
    faces:[...this.actors.values()].filter(e=>e.actor.root.visible).map(e=>this.faceBounds(e)),
    rearOrder:Math.min(...orders)-.5,frontOrder:Math.max(...orders)+1,reducedMotion:view.reducedMotion});
   else art.hide();
   this.effects.render(view,time,this.width,this.height,this.labelAudit.cards,true);
  }else{this.craft?.hide();this.craftBasic?.hide();this.craftShield?.hide();this.craftHeal?.hide();this.craftOven?.hide();this.craftThread?.hide();this.craftTea?.hide();this.craftNeedle?.hide();this.craftYarn?.hide();this.effects.render(view,time,this.width,this.height,this.labelAudit.cards);}
  // D8 / X06 / X07: sample the final original pose after all transforms and
  // actor tint; retain the actor, then place only local floor and inner-edge light.
  const groundOrder=Math.min(...[...this.actors.values()].map(e=>e.actor.root.renderOrder))-1;
  for(const [id,entry]of this.actors){
   if(!entry.craftLight){
    entry.craftDeath?.captureNativeSource(this.renderer,this.camera,{width,worldWidth:this.worldWidth,worldHeight:PAINT.worldHeight,box:this.bounds(entry)});
    continue;
   }
   const sample=this.sampled.get(id),acting=plan?.actorId===id,ms=acting?(frame?.elapsed??0):(view.model?sample?.at??0:0)*1000;
   const ultimate=acting?!!plan?.ultimate:sample?.name==='ult',end=ultimate?2200:800;
   const rise=ultimate?Math.max(0,Math.min(1,(ms-400)/700)):Math.max(0,Math.min(1,(ms-80)/270));
   const fall=1-Math.max(0,Math.min(1,(ms-(ultimate?1175:425))/(end-(ultimate?1175:425))));
   const light=(acting||view.model)&&['attack','ult'].includes(sample?.name??'')?.8*rise*fall:0;
   const death=sample?.name==='ko',opacity=death?Math.max(0,1-(sample?.at??0)/.6):entry.shadow.material.opacity;
   const capture=()=>entry.craftLight!.render(this.renderer,this.camera,{width,height,worldWidth:this.worldWidth,worldHeight:PAINT.worldHeight,
    box:this.bounds(entry),face:this.faceBounds(entry),lightSource:this.craftSource(id)??this.homes.get(id)!.point,
    lightColour:entry.asset==='mochi'?'#ffe3a1':entry.asset==='clover'?'#dcefb1':entry.asset==='panko'?'#ffd4a3':'#bc72ed',light,brightness:acting?1:focusLight,opacity,groundOrder});
   if(entry.craftDeath){
    entry.craftDeath.withSourcePaint(capture);const source=entry.craftLight.source;entry.craftDeath.setSource(source.texture,source.crop);
    if(death)entry.craftLight.rim.visible=false;
   }else capture();
   entry.shadow.visible=false;entry.ring.visible=false;
  }
  this.stats.particles=this.effects.stats.active;
  this.postFx.render(plan,frame?.elapsed??0,delta,view.quality??'high',view.reducedMotion,plan?this.actors.get(plan.actorId)?.actor.root:undefined,plan?this.actors.get(plan.targetIds[0]??plan.actorId)?.actor.root.position:undefined);
  pinCompiledPrograms(this.renderer);
  if(this.restoringContext)this.finishContextRecovery();
  const bannerActor=plan?.ultimate?view.actors.find(a=>a.id===plan.actorId):undefined,bannerEntry=bannerActor?this.actors.get(bannerActor.id):undefined;
  this.cinema.render(ultLive?null:frame,view.paused,view.playbackSpeed??1,view.reducedMotion,view.fixedTime!==undefined,view.battleKey,
   !view.formationC2&&plan?.ultimate&&bannerEntry?this.focusBanner.place(plan,this.bounds(bannerEntry),width,height,this.cinematicRects):undefined,
   view.formationC2&&bannerActor&&bannerEntry?{id:bannerActor.id,name:bannerActor.name,portrait:`/units/${bannerEntry.asset}/portrait.webp`,anchors:this.anchors}:undefined);
  this.bossPhase.render(view,time,width,height,id=>{const entry=this.actors.get(id);return entry?this.bounds(entry):undefined;});
  this.renderHitLights(time,width,height,view);
  this.audio.render(view);
  for(const id of this.groundContacts.keys())if(!this.actors.has(id)){this.groundContacts.delete(id);this.bodyBoxes.delete(id);}
  for(const [id,e]of this.actors){
   const box=this.bounds(e);this.bodyBoxes.set(id,box);
   let point=this.groundContacts.get(id);if(!point){point={x:0,y:0,scale:1,halfWidth:0};this.groundContacts.set(id,point);}
   const feet=e.craftLight?.audit.feet;
   if(feet?.length){point.x=(feet[0]!.x+feet[1]!.x)/2;point.y=(feet[0]!.y+feet[1]!.y)/2;}
   else{this.scratch.copy(e.shadow.position).project(this.camera);point.x=(this.scratch.x*.5+.5)*width;point.y=(.5-this.scratch.y*.5)*height;}
   point.scale=box.height/195;
   point.halfWidth=feet?.length?Math.abs(feet[1]!.x-feet[0]!.x)/2+3:Math.min(100,box.width*.3);
  }
  this.bodyFx.render(view,time,width,height,this.bodyBoxes,this.groundContacts);this.stats.frames++;const info=this.renderer.info;Object.assign(this.stats,{calls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures});
  this.numbers.setAnchors(this.anchors);this.numbers.render(frame,view.cardPresentation,this.width,this.height,view.reducedMotion,true,view.fixedTime);
  if(ultLive&&plan&&ultEntry){
   const alive=(side:'party'|'enemy')=>view.actors.filter(a=>a.side===side&&a.hp>0).flatMap(a=>{const e=this.actors.get(a.id);return e?[this.bounds(e)]:[];});
   const casterSide=view.actors.find(a=>a.id===plan.actorId)?.side??'party',foeSide=casterSide==='party'?'enemy':'party';
   const anchors={caster:{origin:this.socket(plan.actorId,'vfxOrigin')??{x:0,y:0},hand:this.socket(plan.actorId,'mainHand')??{x:0,y:0},box:this.bounds(ultEntry)},
    targets:plan.targetIds.filter(id=>view.actors.some(a=>a.id===id&&a.side===foeSide&&a.hp>0)).flatMap(id=>{const e=this.actors.get(id);return e?[this.bounds(e)]:[];}),
    team:alive(casterSide),enemies:alive(foeSide)};
   if(!this.ult5.lungeReach)this.ult5.aim(anchors,width);
   // Presentation only: a painter fault must never stop the battle clock.
   try{this.ult5.paint(ultLive.at,anchors,width,height,!!view.reducedMotion,!!view.paused,ultEntry.actor.root);}catch(error){console.warn('V9 ultimate paint',error);this.ult5.end();}
  }
 }
 private screen(vector:T.Vector3){vector.project(this.camera);return{x:(vector.x*.5+.5)*this.width,y:(.5-vector.y*.5)*this.height};}
 private bounds(entry:DisplayActor,b=entry.actor.bounds):Rect{
  const opaque=b===entry.actor.bounds?entry.actor.opaqueWorld:undefined;
  if(opaque){const top=this.screen(this.scratch.set(opaque.x,opaque.y+opaque.height,0)),bottom=this.screen(this.scratch.set(opaque.x+opaque.width,opaque.y,0));return{x:top.x,y:top.y,width:bottom.x-top.x,height:bottom.y-top.y};}
  const root=entry.actor.root;let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  // Opposite corners alone collapse a rotated rectangle at a quarter turn.
  // Every corner must participate in framing, face protection and label lanes.
  for(const x of [b.x,b.x+b.width])for(const y of [b.y,b.y+b.height]){
   const p=this.screen(root.localToWorld(this.scratch.set(x,y,0)));
   left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);
  }
  return{x:left,y:top,width:right-left,height:bottom-top};
 }
 private faceBounds(entry:DisplayActor):Rect{
  const measuredFace=entry.asset==='mochi'||entry.asset==='clover'?entry.actor.faceRegion:undefined;
  const region=measuredFace??unitFace(entry.asset,entry.actor.bounds),corners=entry.craftPose?.faceCorners(region);
  if(!corners)return this.bounds(entry,region);
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const corner of corners){
   const p=this.screen(entry.actor.root.localToWorld(this.scratch.set(corner.x,corner.y,0)));
   left=Math.min(left,p.x);top=Math.min(top,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);
  }
  return{x:left,y:top,width:right-left,height:bottom-top};
 }
 private renderHitLights(time:number,width:number,height:number,view:SceneView){
  if(!this.hitLights)return;
  this.hits=this.hits.filter(h=>time-h.at>=0&&time-h.at<.42&&this.actors.has(h.id));
  const k=height/720,reduced=!!view.reducedMotion,ult=!!this.ult5?.active;
  const sparks=ult?[]:this.hits.slice(-8).map((h,i)=>{const b=this.bounds(this.actors.get(h.id)!);return {x:b.x+b.width/2,y:b.y+b.height*.42,r:Math.min(b.height*.3,90*k),life:(time-h.at)/.42,power:h.power,color:h.color,seed:i};});
  // V10: an enraged boss (phase 2+) burns with a rising aura; the phase change itself erupts.
  const columns:{x:number;y:number;w:number;h:number;alpha:number}[]=[],pools:{x:number;y:number;r:number;power:number}[]=[],bursts:{x:number;y:number;r:number;life:number;power:number}[]=[],rings:{x:number;y:number;r:number;life:number;power:number}[]=[],flames:{x:number;y:number;w:number;h:number;alpha:number}[]=[];
  let flash=0;
  for(const unit of view.actors){
   const entry=this.actors.get(unit.id);if(!entry||unit.side!=='enemy'||unit.hp<=0||entry.actor.unit.tier!=='boss'||entry.phase<2)continue;
   const b=this.bounds(entry),feet=b.y+b.height*.97,cx=b.x+b.width/2,pulse=reduced?0:Math.sin(time*3.1)*.12;
   if(!ult){
    pools.push({x:cx,y:feet+10*k,r:b.width*.6,power:.35+pulse});
    // Flames lick up around its feet.
    if(unit.id!==view.frame?.plan.actorId)for(let i=0;i<4;i++){const flick=reduced?1:.8+.2*Math.sin(time*6.3+i*2.1);flames.push({x:cx+(i-1.5)*b.width*.24,y:feet+12*k,w:b.width*(i%2?.2:.24),h:b.height*(i%2?.3:.4)*flick,alpha:.7});}
   }
   const age=time-entry.phaseAt;
   // The eruption never plays under an ally ultimate cut-in: the dimmed screen plus a red blast read as mud.
   if(age>=0&&age<1.3&&!reduced&&!ult){bursts.push({x:cx,y:feet,r:b.height*.62,life:age/1.3,power:1});rings.push({x:cx,y:feet,r:b.width*1.3,life:Math.min(1,age/1),power:1});if(age<.14)flash=.22*(1-age/.14);}
  }
  if(!sparks.length&&!columns.length&&!bursts.length&&!flames.length&&!pools.length){this.hitLights.clear();return;}
  this.hitLights.draw({w:width,h:height,time,flash,bursts,rings,columns,pools,sparks,flames,palette:fxPalette({core:'#ffd9a8',glow:'#ff5a3c',accent:'#c04cff',deep:'#3a0c22'})});
 }
 private projectAnchors(view:SceneView){
  this.anchors.length=0;const labels:LabelInput[]=[],text:LabelInput[]=[],bodies:Rect[]=[];
  for(const unit of view.actors){const entry=this.actors.get(unit.id);if(!entry)continue;
   const actor=entry.actor,hp=this.screen(actor.socket('hpAnchor',this.scratch)),face=this.screen(actor.socket('head',this.scratch)),foot=this.screen(actor.socket('feet',this.scratch)),body=this.bounds(entry);
   const anchor:SceneAnchor={id:unit.id,x:face.x,y:hp.y,labelX:hp.x,labelY:hp.y,footY:foot.y,body,face:this.faceBounds(entry),visible:unit.hp>0&&(unit.side==='enemy'||!!view.formationC2)};this.anchors.push(anchor);
   // Authored HP sockets clear the commissioned props; Clover's badge also needs the measured tail clearance.
   if(view.formationC2&&hasDesignerIdleBody(entry.asset,actor))anchor.labelTarget={x:hp.x,y:hp.y+(entry.asset==='clover'?5:0),avoid:body};
   if(unit.hp>0)bodies.push(body);
   if(anchor.visible)labels.push({id:unit.id,x:hp.x,y:hp.y,height:view.formationC2?40:52,head:body});
   const rows=view.cardNumberRows?.[unit.id]??0,burst=view.cardPresentation?.bursts.includes(unit.id);if(rows||burst)text.push({id:unit.id,x:hp.x,y:hp.y-52,height:Math.max(34,rows*34)+(burst?34:0),head:body});
  }
  const labelWidth=view.formationC2?110:138,placed=layoutLabels(labels,this.width,this.height,labelWidth,bodies),words=layoutLabels(text,this.width,this.height,150,[...bodies,...placed.values()]);
  for(const anchor of this.anchors){const box=placed.get(anchor.id);if(box){anchor.labelX=box.x+labelWidth/2;anchor.labelY=box.y;}else anchor.visible=false;anchor.textLane=words.get(anchor.id);
   // Dense formations can exhaust empty floor lanes. Keep contact feedback on
   // the target's lower body, safely below its face, instead of dropping it.
   if(!anchor.textLane&&text.some(t=>t.id===anchor.id)){const h=text.find(t=>t.id===anchor.id)!.height;anchor.textLane={x:Math.max(4,Math.min(this.width-154,anchor.x-75)),y:Math.max(4,Math.min(this.height-h-4,anchor.footY-h-12)),width:150,height:h};}
  }
  this.labelAudit.heads=bodies;this.labelAudit.cards=[...placed.values(),...words.values()];this.labelAudit.missing=labels.filter(l=>!placed.has(l.id)).map(l=>l.id);
  // Reserve number lanes for their later contact, but do not let invisible
  // numbers displace the pre-contact ultimate card. HP and bodies stay protected.
  this.cinematicRects=[...bodies,...placed.values(),...(this.firstHit?words.values():[])];
  this.labelAudit.overlaps=this.labelAudit.cards.reduce((sum,box,i)=>sum+bodies.filter(b=>intersects(box,b,0)).length+this.labelAudit.cards.slice(i+1).filter(b=>intersects(box,b,0)).length,0);
  if(view.formationC2)for(const anchor of this.anchors){
   const entry=this.actors.get(anchor.id);if(!entry)continue;
   const b=this.bounds(entry);anchor.labelX=Math.max(36,Math.min(this.width-36,anchor.x));
   anchor.labelY=Math.max(18,b.y-9);anchor.visible=view.actors.some(u=>u.id===anchor.id&&u.hp>0);
  }
  this.onAnchors(this.anchors);
 }
 private craftSource(actorId:string){
  const entry=this.actors.get(actorId);
  const spout=entry?.asset==='clover'&&hasDesignerIdleBody(entry.asset,entry.actor);
  return this.socket(actorId,entry?.craftPose||spout?'vfxOrigin':'mainHand');
 }
 socket(actorId:string,name:SpineSocket){const entry=this.actors.get(actorId);return entry?this.screen(entry.actor.socket(name,this.scratch)):undefined;}
 pixelsPerUnit(actorId:string){const entry=this.actors.get(actorId);return entry?this.height*this.camera.zoom/(this.camera.top-this.camera.bottom)*Math.abs(entry.actor.root.scale.y):undefined;}
 sizeAudit(){return{width:this.width,height:this.height,modelToStage:1,units:[...this.actors].filter(([,entry])=>entry.actor.root.visible).map(([id,entry])=>{const box=this.bounds(entry),coreBox=this.bounds(entry,unitCore(entry.asset,entry.actor.bounds).world),faceBox=this.faceBounds(entry);return{id,asset:entry.asset,side:entry.actor.unit.side,kind:entry.actor.unit.tier,height:entry.actor.bounds.height,footprint:entry.actor.bounds.width,box,coreBox,faceBox,drawOrder:entry.actor.root.children[0]?.renderOrder??0,ratio:box.height/this.height,source:entry.actor.source,fallback:entry.actor.source==='puppet'};})};}
 audit(){return{camera:{scale:this.camera.zoom,x:this.camera.position.x,y:this.camera.position.y,rotation:this.camera.rotation.z,worldWidth:this.worldWidth,worldHeight:PAINT.worldHeight},focus:{brightness:1-(this.currentView?.frame?sequenceAt(this.currentView.frame.plan,this.currentView.frame.elapsed)?.dim??0:0),outline:this.casterFocus.root.visible},renderer:'taskbar-cutout',orthographic:true,zoom:this.camera.zoom,stage:this.stage.audit(),cache:spineCacheStats(),events:this.eventAudit,motion:this.motionAudit,labels:this.labelAudit,stats:this.stats,vfx:this.effects.stats,cinematic:this.cinematic,sequence:this.cinema.audit,bossPhase:this.bossPhase.audit,weather:this.weather.audit,units:this.sizeAudit().units};}
 private releaseActor(entry:DisplayActor){entry.craftDeath?.dispose();entry.craftLight?.dispose();entry.actor.dispose();for(const mesh of [entry.shadow,entry.ring,entry.hit]){mesh.material.dispose();mesh.removeFromParent();}}
 dispose(){if(this.disposed)return;this.disposed=true;this.ult5?.dispose();cancelAnimationFrame(this.raf);this.resize.disconnect();document.removeEventListener('visibilitychange',this.visibility);this.renderer.domElement.removeEventListener('webglcontextlost',this.lost);this.renderer.domElement.removeEventListener('webglcontextrestored',this.restored);this.renderer.domElement.removeEventListener('pointerup',this.pick);for(const entry of this.actors.values())this.releaseActor(entry);this.actors.clear();this.pending.clear();this.failed.clear();this.lanes.clear();this.sampled.clear();this.ready=false;this.stage.dispose();this.shadowTexture.dispose();this.geometry.dispose();this.ringGeometry.dispose();this.effects.dispose();this.numbers.dispose();this.bodyFx.dispose();this.bossPhase.dispose();this.weather.dispose();this.trails.dispose();this.casterFocus.dispose();this.homes.clear();this.cinema.dispose();this.craftEffects.dispose();this.hitLights?.dispose();this.postFx.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
}
