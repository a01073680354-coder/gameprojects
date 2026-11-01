"""The blade cyborg's poses as a function of a rig module, so other sword
(or baton) fighters can reuse the same animation layout as assets/blade.json."""


def build(H):
    frames, ANIMS = [], {}


    def anim(name, fps, loop, *fs):
        s = len(frames)
        frames.extend(fs)
        ANIMS[name] = {"start": s, "end": len(frames) - 1, "fps": fps, "loop": loop}


    F = H.frame
    GUARD = dict(arm=(15, -30), sword=("held", -40), legs=((8, 0), (-7, 0)), lean=1, tail=2)


    def g(**kw):
        dd = dict(GUARD)
        dd.update(kw)
        return F(**dd)


    anim("guard", 5, True, g(), g(bob=1, bun=(0, 1)), g(bob=1, bun=(-1, 1)), g(bun=(-1, 0)))
    WALK = [((8, 0), (-6, 0)), ((5, 2), (-4, 0)), ((3, 3), (-2, 0)), ((6, 0), (-6, 2)), ((8, 0), (-5, 3)), ((7, 0), (-7, 0))]
    anim("walk", 10, True, *[g(legs=WALK[i], bob=1 if i % 3 == 0 else 0, bun=(-2, i % 2), lean=2, tail=3) for i in range(6)])
    # anticipation: rise, then coil deep with the blade cocked behind the head
    anim("windup", 9, False,
         F(lean=-1, legs=((7, 0), (-7, 0)), arm=(-80, -35), sword=("held", -110), droop=(0.2, 1), bun=(1, 0), tail=1),
         F(bob=2, lean=-4, legs=((8, 0), (-9, 0)), arm=(-125, -20), sword=("held", -160), droop=(0.3, 1), bun=(2, -1), tail=-1, hemFront=1),
         F(bob=3, lean=-5, headDy=1, legs=((8, 0), (-10, 0)), arm=(-135, -12), sword=("held", -172), droop=(0.3, 1), bun=(2, -2), tail=-2, hemFront=2))
    # first cut: diagonal downward slash with a lunging step and a full crescent
    anim("strike", 26, False,
         F(bob=3, lean=7, legs=((13, 0), (-9, 0)), arm=(8, 0), sword=("held", 28), smear=(-150, 28), hemBack=5, tail=6, bun=(-3, 1)),
         F(bob=3, lean=6, legs=((13, 0), (-9, 0)), arm=(48, -4), sword=("held", 80), smear=(10, 80), hemBack=4, tail=5, bun=(-3, 2)),
         F(bob=2, lean=4, legs=((12, 0), (-8, 0)), arm=(55, -22), sword=("held", 62), hemBack=2, tail=3, bun=(-2, 1)))
    # second cut: a rising reverse slash
    anim("strike2", 26, False,
         F(bob=1, lean=6, legs=((12, 0), (-10, 0)), arm=(-18, 0), sword=("held", -48), smear=(110, -48), hemBack=4, tail=5, bun=(-3, -1)),
         F(bob=0, lean=5, legs=((12, 0), (-10, 1)), arm=(-72, -4), sword=("held", -118), smear=(-30, -118), hemBack=3, tail=4, bun=(-2, -2)),
         F(bob=1, lean=3, legs=((11, 0), (-9, 0)), arm=(-55, -24), sword=("held", -85), hemBack=2, tail=2, bun=(-1, -1)))
    anim("recover", 6, False,
         F(bob=2, lean=3, legs=((10, 0), (-7, 0)), arm=(50, -28), sword=("held", 55), tail=3),
         F(bob=1, lean=2, legs=((9, 0), (-7, 0)), arm=(38, -30), sword=("held", 20), tail=2),
         F(bob=1, lean=1, legs=((8, 0), (-7, 0)), arm=(25, -30), sword=("held", -10), tail=2))
    # iai stance before the "!" lunge: very low, blade drawn back along the hip
    anim("heavy", 8, True,
         F(bob=6, lean=5, headDy=1, legs=((12, 0), (-11, 0)), arm=(155, 22), sword=("held", 176), droop=(-0.5, 1), hemBack=3, tail=5, bun=(-3, 1)),
         F(bob=6, lean=5, headDy=2, legs=((12, 0), (-11, 0)), arm=(157, 24), sword=("held", 178), droop=(-0.5, 1), hemBack=4, tail=6, bun=(-4, 1)))
    # the lunge: horizontal draw-cut at full stretch, then follow-through
    anim("lunge", 18, False,
         F(bob=3, lean=9, legs=((14, 0), (-13, 2)), arm=(2, 0), sword=("held", -2), smear=(165, -2), hemBack=9, tail=9, bun=(-5, 0)),
         F(bob=3, lean=9, legs=((14, 0), (-14, 3)), arm=(-6, 0), sword=("held", -10), hemBack=9, tail=9, bun=(-5, 0)),
         F(bob=2, lean=6, legs=((13, 0), (-11, 1)), arm=(28, -8), sword=("held", 38), smear=(-10, 38), hemBack=6, tail=6, bun=(-4, 1)))
    anim("block", 10, False, F(lean=-1, legs=((7, 0), (-8, 0)), arm=(-45, -25), sword=("held", -95), droop=(0.2, 1), tail=1))
    anim("recoil", 10, False,
         F(lean=-4, headDy=-1, legs=((6, 1), (-8, 0)), arm=(-150, 15), sword=("held", -160), droop=(0.6, 0.6), hemFront=2, tail=-2, bun=(2, -1)))
    stag = F(bob=7, lean=-2, headDy=2, legs=((6, 0), (-3, 0)), arm=(100, -5), sword=("held", 105), droop=(0, 1), hemLift=-1, tail=0, bun=(1, 2))
    anim("stagger", 3, True, stag, F(bob=7, lean=-1, headDy=3, legs=((6, 0), (-3, 0)), arm=(95, -5), sword=("held", 100), droop=(0, 1), hemLift=-1, tail=0, bun=(1, 3)))
    anim("hurt", 10, False, F(lean=-4, headDy=-1, legs=((6, 2), (-6, 0)), arm=(-60, -20), sword=("held", -60), droop=(0.6, 0.6), hemFront=2, bun=(2, -1)))
    anim("dead", 1, False, H.lying(stag))


    return frames, ANIMS
