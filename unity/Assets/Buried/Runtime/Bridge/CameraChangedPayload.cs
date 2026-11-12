namespace Buried.Interop
{
    [SchemaDef("cameraChangedPayload")]
    public sealed class CameraChangedPayload
    {
        public CameraPoint eye;
        public CameraPoint target;
        public double fovDeg;

        /// <summary>16 numbers, column-major: element (row r, column c) is at index c * 4 + r.</summary>
        public double[] viewProjection;

        public CanvasSize canvas;
    }
}
