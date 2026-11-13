namespace Buried.Scene
{
    /// <summary>
    /// The state of "Raise the past" (bridge 0.8.0): which era was raised, the raise clock, and whether the raised era is
    /// still drawn whole because no scene/setDepth has taken over. Pure and clock-driven, so an EditMode test can step it.
    /// The Player owns the animation: the Shell sends scene/raise once and waits for scene/raised.
    /// </summary>
    public sealed class RaiseState
    {
        /// <summary>The era named by the last scene/raise, or null before any.</summary>
        public string EraId { get; private set; }

        /// <summary>True from the first scene/raise on: today's buildings stay solid and sink to plinths instead of draining to an outline.</summary>
        public bool Used { get; private set; }

        /// <summary>True while the raise clock is running.</summary>
        public bool Active { get; private set; }

        /// <summary>
        /// True from scene/raise until the next scene/setDepth: the raised era is drawn at weight 1 even though the
        /// depth may still be Today's, so the Shell can raise first and move the ruler after scene/raised.
        /// </summary>
        public bool Pinned { get; private set; }

        /// <summary>Seconds since the raise started; <see cref="RaiseSchedule.TotalS"/> once it has settled.</summary>
        public float Clock { get; private set; }

        /// <summary>How far the plinths have sunk and the sheet has brightened (0 to 1).</summary>
        public float Sink
        {
            get { return Used ? RaiseSchedule.Sink(Clock) : 0f; }
        }

        /// <summary>Starts a raise of <paramref name="eraId"/>. With <paramref name="animate"/> false it is over at once.</summary>
        public void Start(string eraId, bool animate)
        {
            EraId = eraId;
            Used = true;
            Pinned = true;
            Clock = animate ? 0f : RaiseSchedule.TotalS;
            Active = animate;
        }

        /// <summary>Advances the clock. Returns true on the call in which the raise settles.</summary>
        public bool Tick(float deltaS)
        {
            if (!Active) return false;
            Clock += deltaS;
            if (Clock < RaiseSchedule.TotalS) return false;
            Clock = RaiseSchedule.TotalS;
            Active = false;
            return true;
        }

        /// <summary>A scene/setDepth has arrived: the depth decides what is drawn again.</summary>
        public void Unpin()
        {
            Pinned = false;
        }

        /// <summary>Back to the state after scene/init.</summary>
        public void Reset()
        {
            EraId = null;
            Used = false;
            Active = false;
            Pinned = false;
            Clock = 0f;
        }
    }
}
