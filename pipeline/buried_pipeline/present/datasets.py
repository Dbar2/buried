"""The present-day datasets, defined once. Mirrors the table in spec 02 design.md "present".

`id_field` and `kept_fields` are `None` until they are confirmed from the first downloaded file
(spec 02 task 10.4 / 10.5). Until then `buried present` downloads, lists the file's fields and stops
for that dataset with "dataset fields not confirmed". Nothing is guessed here. All four layers are
confirmed (intersections in task 10.4, the others in task 10.5).

`resource_name` names the GPKG resource to use when a package offers several. `None` means the
package is expected to have exactly one.
"""

from __future__ import annotations

from dataclasses import dataclass

from buried_pipeline.errors import PipelineError

CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca"
CKAN_HOST = "ckan0.cf.opendata.inter.prod-toronto.ca"


@dataclass(frozen=True)
class PresentDataset:
    source_id: str
    package_id: str
    geometry: tuple[str, ...]  # allowed GeoJSON geometry types
    id_field: str | None = None
    kept_fields: tuple[str, ...] | None = None
    resource_name: str | None = None

    @property
    def fields_confirmed(self) -> bool:
        return self.id_field is not None and self.kept_fields is not None


# Intersections first: it is the only layer the alignment gate needs.
DATASETS: tuple[PresentDataset, ...] = (
    PresentDataset(
        source_id="present_toronto_intersections_2026",
        package_id="intersection-file-city-of-toronto",
        geometry=("Point",),
        # Confirmed from the downloaded file (spec 02 task 10.4). The id is the City's
        # INTERSECTION_ID. The description lists the street names ("A St / B Ave"); the
        # classification code and text tell a person whether it is a true street crossing
        # (for example "Pseudo Intersection-Overpass/Underpass" is not one).
        id_field="INTERSECTION_ID",
        kept_fields=("INTERSECTION_DESC", "CLASSIFICATION", "CLASSIFICATION_DESC"),
        # The package offers the same layer in EPSG:4326 and EPSG:2952 (NAD83(CSRS) / MTM zone 10).
        # The projected one is used: pyproj goes from 2952 to EPSG:26917 within the NAD83 family,
        # while 4326 to 26917 goes through a ballpark NAD83-to-WGS84 step it rates at 4 m.
        resource_name="Centreline Intersection - 2952.gpkg",
    ),
    PresentDataset(
        source_id="present_toronto_building_outlines_2026",
        package_id="topographic-mapping-building-outlines",
        geometry=("Polygon", "MultiPolygon"),
        # Confirmed from the downloaded file (spec 02 task 10.5). The file has no building id of
        # its own: OBJECTID is the City's object id (unique across the 1547 outlines inside the
        # bounds); `_id` is the portal's row number and is not used. The id is stable for this
        # retrieval only, which is all a source id promises (sources.md): a later retrieval with
        # different content gets a new source id. The subtype tells a reader a building from a
        # garage or a miscellaneous structure. DERIVED_HEIGHT and ELEVATION are left out: which
        # source gives present-day heights is open (tech.md), so no height is picked here.
        id_field="OBJECTID",
        kept_fields=("SUBTYPE_CODE", "SUBTYPE_DESC"),
        # Same reason as the intersections: the package offers EPSG:4326 and EPSG:2952, and the
        # projected one goes to EPSG:26917 within the NAD83 family without a ballpark step.
        resource_name="Building Outlines - 2952.gpkg",
    ),
    PresentDataset(
        source_id="present_toronto_property_boundaries_2026",
        package_id="property-boundaries",
        geometry=("Polygon", "MultiPolygon"),
        # Confirmed from the downloaded file (spec 02 task 10.5). PARCELID is the City's parcel
        # id, unique across the 1623 parcels inside the bounds. FEATURE_TYPE (COMMON, CONDO or
        # RESERVE) is kept because the Report picks lots: a RESERVE is a narrow strip, not
        # a lot someone would ask about. STATEDAREA (text such as "58.65 sq.m"), `_id` and
        # OBJECTID are left out: no consumer needs them. The dataset has no status field.
        id_field="PARCELID",
        kept_fields=("FEATURE_TYPE",),
        resource_name="Property Boundaries - 2952.gpkg",  # projected, as for the intersections
    ),
    PresentDataset(
        source_id="present_toronto_address_points_2026",
        package_id="address-points-municipal-toronto-one-address-repository",
        geometry=("Point",),
        # Confirmed from the downloaded file (spec 02 task 10.5). The file stores each address as
        # a one-point MultiPoint, written as a Point (requirement 12.12). ADDRESS_POINT_ID is the
        # City's id, unique across the 2208 points inside the bounds. Kept for search and the
        # Report: the full address as printed, its number and street, and MAINT_STAGE
        # (REGULAR or RESERVED: 374 of the 2208 are reserved numbers, so whoever builds search
        # decides whether to offer them). Everything else (ward, centreline links, class codes,
        # place names, the unfilled GENERAL_USE and ADDRESS_STATUS) has no named consumer.
        id_field="ADDRESS_POINT_ID",
        kept_fields=("ADDRESS_FULL", "ADDRESS_NUMBER", "LINEAR_NAME_FULL", "MAINT_STAGE"),
        resource_name="Address Points - 2952.gpkg",  # projected, as for the intersections
    ),
)


def get_dataset(source_id: str, datasets: tuple[PresentDataset, ...] = DATASETS) -> PresentDataset:
    for dataset in datasets:
        if dataset.source_id == source_id:
            return dataset
    raise PipelineError(f"No present-day dataset is defined for {source_id}")
