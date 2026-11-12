namespace Buried.Interop
{
    [SchemaDef("debugSetCameraPayload")]
    public sealed class DebugSetCameraPayload
    {
        /// <summary>EPSG:26917 easting, northing of the ground point the camera looks at.</summary>
        public double[] target;
        public double distanceM;
        public double pitchDeg;
        public double headingDeg;
    }
}
